import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import {
  normalizeSubjectOrder,
  subjectOrderToBaseIndex,
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
 * 생성된 섹션은 기존 섹션 뒤에 append된다.
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
    try {
      const raw = await req.json().catch(() => undefined);
      body = BodySchema.parse(raw ?? undefined);
    } catch (parseErr) {
      if (parseErr instanceof z.ZodError) {
        return NextResponse.json(
          { error: parseErr.issues[0]?.message ?? "invalid_body" },
          { status: 400 }
        );
      }
      // no body is also fine
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
      orderBy: { number: { sort: "asc", nulls: "last" } },
      select: { id: true, name: true, number: true },
    });

    if (students.length === 0) {
      return NextResponse.json(
        { error: "이 학급에 등록된 학생이 없습니다." },
        { status: 400 }
      );
    }

    // 고정 섹션은 앞쪽에 유지하고, 새 학생 섹션은 그 다음부터 배치한다.
    const pinnedCount = await db.section.count({
      where: { boardId, pinned: true },
    });

    const subjectOrder = normalizeSubjectOrder(
      body?.subjectOrder ?? board.subjectOrder,
    );

    // 학생별 섹션 생성 (출석번호 이름 형식: "1. 홍길동").
    // 정렬 방향:
    //   asc  → 1번 학생이 보드 왼쪽 (order DESC: pinnedCount + (N-1-i))
    //   desc → N번 학생이 보드 왼쪽 (order ASC : pinnedCount + i)
    // unpinned 섹션은 sortSections에서 order DESC로 표시되므로
    // 보드 왼쪽 = 큰 order 이다.
    const created = await db.$transaction(
      students.map((s, studentIndex) => {
        const baseIndex = subjectOrderToBaseIndex(
          subjectOrder,
          studentIndex,
          students.length,
        );
        return db.section.create({
          data: {
            boardId,
            title: s.number != null ? `${s.number}. ${s.name}` : s.name,
            order: pinnedCount + baseIndex,
          },
        });
      })
    );

    // 사용자가 명시적으로 body로 보낸 경우에만 보드 기본값을 기억해 둔다.
    // 보드에 저장된 subjectOrder가 그대로면 best-effort 스킵.
    if (
      body?.subjectOrder !== undefined &&
      body.subjectOrder !== board.subjectOrder
    ) {
      await db.board.update({
        where: { id: boardId },
        data: { subjectOrder },
      });
    }

    // best-effort touch
    await touchBoardUpdatedAt(boardId);

    return NextResponse.json({ sections: created, subjectOrder });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("[POST /api/boards/:id/sections/seed-students]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
