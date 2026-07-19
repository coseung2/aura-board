import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { announceCardChange } from "@/lib/realtime-broadcast";
import {
  normalizeSubjectOrder,
  subjectOrderToAppendOrder,
} from "@/lib/subject-order";

const BodySchema = z
  .object({
    subjectOrder: z.enum(["asc", "desc"]).optional(),
  })
  .optional();

/**
 * POST /api/boards/:id/sections/seed-students
 *
 * classroom-linked columns 보드에서 학급 학생 명단을 출석번호 순으로
 * 섹션(칼럼)을 한 번에 생성한다. 교사(owner/editor) 전용.
 * 생성된 섹션은 기존 unpinned 섹션 뒤에 append된다.
 * 정렬 방향(보드 왼쪽 = 1번 / N번)은 body.subjectOrder → board.subjectOrder → "asc" 순으로 결정된다.
 *
 * 1회성 시드라는 의미에서 중복 실행 시 기존 섹션과 이름이 겹쳐도
 * 새로 생성한다 (교사가 수동 정리).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: boardId } = await params;
    const user = await getCurrentUser();

    let body: z.infer<typeof BodySchema> = undefined;
    const rawText = await req.text();
    if (rawText.trim() !== "") {
      let raw: unknown;
      try {
        raw = JSON.parse(rawText);
      } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
      }

      try {
        body = BodySchema.parse(raw);
      } catch (parseErr) {
        if (parseErr instanceof z.ZodError) {
          return NextResponse.json(
            { error: parseErr.issues[0]?.message ?? "invalid_body" },
            { status: 400 }
          );
        }
        throw parseErr;
      }
    }

    // 교사 권한 확인 + board 존재 + classroomId 검증
    const board = await db.board.findUnique({
      where: { id: boardId },
      select: { classroomId: true, layout: true, subjectOrder: true },
    });
    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }
    if (!board.classroomId) {
      return NextResponse.json(
        { error: "학급과 연결된 보드만 학생 시드 칼럼을 추가할 수 있습니다." },
        { status: 400 }
      );
    }
    if (board.layout !== "columns") {
      return NextResponse.json(
        { error: "칼럼 보드(columns)에서만 사용할 수 있습니다." },
        { status: 400 }
      );
    }

    await requirePermission(boardId, user.id, "edit");

    // 학급 학생 조회 — 출석번호 정렬
    const students = await db.student.findMany({
      where: { classroomId: board.classroomId },
      orderBy: [
        { number: { sort: "asc", nulls: "last" } },
        { name: "asc" },
        { id: "asc" },
      ],
      select: { id: true, name: true, number: true },
    });

    if (students.length === 0) {
      return NextResponse.json(
        { error: "이 학급에 등록된 학생이 없습니다." },
        { status: 400 }
      );
    }

    const subjectOrder = normalizeSubjectOrder(
      body?.subjectOrder ?? board.subjectOrder,
    );

    // 학생별 섹션 생성 (출석번호 이름 형식: "1. 홍길동").
    // 정렬 방향:
    //   asc  → 1번 학생이 보드 왼쪽 (order DESC)
    //   desc → N번 학생이 보드 왼쪽 (order DESC)
    // unpinned 섹션은 sortSections에서 order DESC로 표시되므로
    // 보드 왼쪽 = 큰 order 이다.
    const created = await db.$transaction(async (tx) => {
      const existing = await tx.section.aggregate({
        where: { boardId, pinned: false },
        _min: { order: true },
      });
      const minimumExistingOrder = existing._min.order;
      const rows = [];

      for (const [studentIndex, student] of students.entries()) {
        rows.push(
          await tx.section.create({
            data: {
              boardId,
              title:
                student.number != null
                  ? `${student.number}. ${student.name}`
                  : student.name,
              order: subjectOrderToAppendOrder(
                subjectOrder,
                studentIndex,
                students.length,
                minimumExistingOrder,
              ),
            },
          }),
        );
      }

      // 사용자가 명시적으로 body로 보낸 경우에만 보드 기본값을 기억해 둔다.
      // 보드에 저장된 subjectOrder가 그대로면 best-effort 스킵.
      if (
        body?.subjectOrder !== undefined &&
        body.subjectOrder !== board.subjectOrder
      ) {
        await tx.board.update({
          where: { id: boardId },
          data: { subjectOrder },
        });
      }

      return rows;
    });

    // best-effort touch + realtime snapshot invalidation
    await touchBoardUpdatedAt(boardId);
    await announceCardChange(boardId, "update");

    return NextResponse.json({ sections: created, subjectOrder });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("[POST /api/boards/:id/sections/seed-students]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
