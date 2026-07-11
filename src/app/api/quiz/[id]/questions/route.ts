import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import { canManageQuiz } from "@/lib/quiz-permissions";
import { publishQuizRealtimeSnapshot } from "@/lib/quiz-realtime-snapshot";
import type { QuizDraftQuestion } from "@/types/quiz";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ids = await resolveIdentities();
    if (!(await canManageQuiz(id, ids))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const existing = await db.quiz.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (existing.status === "active") {
      return NextResponse.json({ error: "quiz_active" }, { status: 409 });
    }

    const body = (await req.json()) as { questions?: QuizDraftQuestion[] };
    const questions = body.questions;
    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "draft_empty" }, { status: 400 });
    }
    for (const q of questions) {
      if (
        !q?.question?.trim() ||
        !q.optionA?.trim() ||
        !q.optionB?.trim() ||
        !q.optionC?.trim() ||
        !q.optionD?.trim() ||
        !["A", "B", "C", "D"].includes(q.answer)
      ) {
        return NextResponse.json({ error: "draft_invalid" }, { status: 400 });
      }
    }

    const capped = questions.slice(0, 20);
    const quiz = await db.$transaction(async (tx) => {
      await tx.quizQuestion.deleteMany({ where: { quizId: id } });
      return tx.quiz.update({
        where: { id },
        data: {
          currentQ: -1,
          questions: {
            create: capped.map((q, i) => ({
              order: i,
              question: q.question,
              optionA: q.optionA,
              optionB: q.optionB,
              optionC: q.optionC,
              optionD: q.optionD,
              answer: q.answer,
            })),
          },
        },
        include: { questions: { orderBy: { order: "asc" } } },
      });
    });
    const snapshot = await publishQuizRealtimeSnapshot(id);

    return NextResponse.json({ quiz, snapshot });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Questions update failed";
    console.error("[PUT /api/quiz/[id]/questions]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
