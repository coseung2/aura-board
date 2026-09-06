import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import { canManageQuiz } from "@/lib/quiz-permissions";
import { canAddCardToBoard } from "@/lib/card-permissions";

import { withProductFeature } from "@/lib/product-release-server";

export const POST = withProductFeature("developmentLayouts", POSTHandler);
async function POSTHandler(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sourceId } = await params;
    const ids = await resolveIdentities();
    if (!(await canManageQuiz(sourceId, ids))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const source = await db.quiz.findUnique({
      where: { id: sourceId },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    if (!source) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as { boardId?: string };
    const targetBoardId = body.boardId ?? source.boardId;

    if (targetBoardId !== source.boardId) {
      const board = await db.board.findUnique({
        where: { id: targetBoardId },
        select: {
          id: true,
          classroomId: true,
          classroom: { select: { teacherId: true } },
          members: { where: { role: "owner" }, select: { userId: true } },
        },
      });
      if (!board) {
        return NextResponse.json({ error: "target_not_found" }, { status: 404 });
      }
      const boardLike = {
        id: board.id,
        classroomId: board.classroomId,
        ownerUserId:
          board.classroom?.teacherId ?? board.members[0]?.userId ?? null,
      };
      if (!canAddCardToBoard(ids, boardLike)) {
        return NextResponse.json({ error: "forbidden_target" }, { status: 403 });
      }
    }

    let roomCode: string;
    do {
      roomCode = String(Math.floor(100000 + Math.random() * 900000));
    } while (await db.quiz.findUnique({ where: { roomCode } }));

    const quiz = await db.quiz.create({
      data: {
        boardId: targetBoardId,
        title: source.title,
        sourceFile: source.sourceFile,
        sourceText: source.sourceText,
        difficulty: source.difficulty,
        parentQuizId: source.id,
        roomCode,
        questions: {
          create: source.questions.map((q) => ({
            order: q.order,
            question: q.question,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            answer: q.answer,
            timeLimit: q.timeLimit,
          })),
        },
      },
      include: { questions: { orderBy: { order: "asc" } } },
    });

    return NextResponse.json({ quiz });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Clone failed";
    console.error("[POST /api/quiz/[id]/clone]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
