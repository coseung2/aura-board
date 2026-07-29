import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { verifyQuizPlayerToken } from "@/lib/quiz-player-token";
import { publishQuizRealtimeSnapshot } from "@/lib/quiz-realtime-snapshot";

type AnswerErrorCode =
  | "Question not found"
  | "Player not found"
  | "Player not owned"
  | "Quiz mismatch"
  | "Quiz not active"
  | "Question not current"
  | "Already answered";

class AnswerSubmissionError extends Error {
  constructor(
    public readonly code: AnswerErrorCode,
    public readonly status: number,
  ) {
    super(code);
    this.name = "AnswerSubmissionError";
  }
}

export async function POST(req: Request) {
  try {
    const student = await getCurrentStudent();
    const { questionId, playerId, playerToken, selected, timeMs } = await req.json();

    if (!questionId || !playerId || !selected) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!["A", "B", "C", "D"].includes(selected)) {
      return NextResponse.json({ error: "Invalid answer" }, { status: 400 });
    }
    if (timeMs !== undefined && (!Number.isFinite(timeMs) || timeMs < 0)) {
      return NextResponse.json({ error: "Invalid timeMs" }, { status: 400 });
    }

    const normalizedTimeMs = Math.floor(timeMs ?? 0);

    const result = await db.$transaction(async (tx) => {
      const [question, player] = await Promise.all([
        tx.quizQuestion.findUnique({
          where: { id: questionId },
          select: { id: true, quizId: true, answer: true },
        }),
        tx.quizPlayer.findUnique({
          where: { id: playerId },
          select: { id: true, quizId: true, studentId: true },
        }),
      ]);
      if (!question) throw new AnswerSubmissionError("Question not found", 404);
      if (!player) throw new AnswerSubmissionError("Player not found", 404);
      const tokenClaims =
        typeof playerToken === "string"
          ? verifyQuizPlayerToken(playerToken)
          : null;
      const ownsStudentPlayer = Boolean(
        student && player.studentId === student.id,
      );
      const ownsAnonymousPlayer = Boolean(
        player.studentId === null &&
          tokenClaims?.playerId === player.id &&
          tokenClaims.quizId === player.quizId,
      );
      if (!ownsStudentPlayer && !ownsAnonymousPlayer) {
        throw new AnswerSubmissionError("Player not owned", 403);
      }
      if (player.quizId !== question.quizId) {
        throw new AnswerSubmissionError("Quiz mismatch", 409);
      }

      const existing = await tx.quizAnswer.findUnique({
        where: { questionId_playerId: { questionId, playerId } },
      });
      if (existing) throw new AnswerSubmissionError("Already answered", 400);

      const quiz = await tx.quiz.findUnique({
        where: { id: question.quizId },
        select: {
          status: true,
          currentQ: true,
          questions: {
            orderBy: { order: "asc" },
            select: { id: true },
          },
        },
      });
      if (!quiz || quiz.status !== "active") {
        throw new AnswerSubmissionError("Quiz not active", 409);
      }
      if (quiz.questions[quiz.currentQ]?.id !== question.id) {
        throw new AnswerSubmissionError("Question not current", 409);
      }

      const correct = selected === question.answer;
      // Score: max 1000, lose 50 per second (faster = more points)
      const points = correct
        ? Math.max(0, 1000 - Math.floor(normalizedTimeMs / 20))
        : 0;

      const created = await tx.quizAnswer.create({
        data: {
          questionId,
          playerId,
          selected,
          correct,
          timeMs: normalizedTimeMs,
        },
      });

      if (points > 0) {
        await tx.quizPlayer.update({
          where: { id: playerId },
          data: { score: { increment: points } },
        });
      }
      return {
        answer: created,
        correct,
        points,
        correctAnswer: question.answer,
        quizId: question.quizId,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const snapshot = await publishQuizRealtimeSnapshot(result.quizId);
    return NextResponse.json({
      answer: result.answer,
      correct: result.correct,
      correctAnswer: result.correctAnswer,
      points: result.points,
      snapshot,
    });
  } catch (e) {
    if (e instanceof AnswerSubmissionError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Already answered" }, { status: 400 });
    }
    console.error("[POST /api/quiz/answer]", e);
    return NextResponse.json({ error: "Answer failed" }, { status: 500 });
  }
}
