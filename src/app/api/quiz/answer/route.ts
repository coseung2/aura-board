import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publishQuizRealtimeSnapshot } from "@/lib/quiz-realtime-snapshot";

export async function POST(req: Request) {
  try {
    const { questionId, playerId, selected, timeMs } = await req.json();

    if (!questionId || !playerId || !selected) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const question = await db.quizQuestion.findUnique({
      where: { id: questionId },
      select: { id: true, quizId: true, answer: true },
    });
    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    const correct = selected === question.answer;
    // Score: max 1000, lose 50 per second (faster = more points)
    const points = correct ? Math.max(0, 1000 - Math.floor((timeMs || 0) / 20)) : 0;

    const answer = await db.$transaction(async (tx) => {
      const existing = await tx.quizAnswer.findUnique({
        where: { questionId_playerId: { questionId, playerId } },
      });
      if (existing) return null;

      const created = await tx.quizAnswer.create({
        data: {
          questionId,
          playerId,
          selected,
          correct,
          timeMs: timeMs || 0,
        },
      });

      if (points > 0) {
        await tx.quizPlayer.update({
          where: { id: playerId },
          data: { score: { increment: points } },
        });
      }
      return created;
    });

    if (!answer) {
      return NextResponse.json({ error: "Already answered" }, { status: 400 });
    }

    const snapshot = await publishQuizRealtimeSnapshot(question.quizId);
    return NextResponse.json({
      answer,
      correct,
      correctAnswer: question.answer,
      points,
      snapshot,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Already answered" }, { status: 400 });
    }
    console.error("[POST /api/quiz/answer]", e);
    return NextResponse.json({ error: "Answer failed" }, { status: 500 });
  }
}
