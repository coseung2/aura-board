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
 * 섹션을 한 번에 생성한다. 교사(owner/editor) 전용.
 * 생성된 섹션은 기존 unpinned 섹션 뒤에 append된다.
 * 정렬 방향(보드 왼쪽 = 1번 / N번)은
 * body.subjectOrder → board.subjectOrder → "asc" 순으로 결정된다.
 *
 * 중복 실행 시 기존 섹션과 이름이 겹쳐도 새로 생성한다.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: boardId } = await params;
    const user = await getCurrentUser();
    const rawBody = await req.text();
    const body = BodySchema.parse(
      rawBody.trim() ? JSON.parse(rawBody) : undefined,
    );

    const board = await db.board.findUnique({
      where: { id: boardId },
      select: { classroomId: true, layout: true, subjectOrder: true },
    });
    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }
    if (!board.classroomId) {
      return NextResponse.json(
        { error: "학급과 연결된 보드만 학생 섹션을 추가할 수 있습니다." },
        { status: 400 },
      );
    }
    if (board.layout !== "columns") {
      return NextResponse.json(
        { error: "주제별 보드(columns)에서만 사용할 수 있습니다." },
        { status: 400 },
      );
    }

    await requirePermission(boardId, user.id, "edit");

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
        { status: 400 },
      );
    }

    const subjectOrder = normalizeSubjectOrder(
      body?.subjectOrder ?? board.subjectOrder,
    );

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

    try {
      await touchBoardUpdatedAt(boardId);
      await announceCardChange(boardId, "update");
    } catch (sideEffectError) {
      console.error(
        "[POST /api/boards/:id/sections/seed-students] side effect failed",
        sideEffectError,
      );
    }

    return NextResponse.json({ sections: created, subjectOrder });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "입력값을 확인해주세요." }, { status: 400 });
    }
    console.error("[POST /api/boards/:id/sections/seed-students]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
