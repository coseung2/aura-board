import "server-only";

import { db } from "@/lib/db";
import type { QuizRealtimeSnapshot } from "@/features/quiz/realtime";

const EMPTY_DISTRIBUTION: QuizRealtimeSnapshot["distribution"] = {
  A: 0,
  B: 0,
  C: 0,
  D: 0,
};

/**
 * Load the public game-state snapshot used by Broadcast and recovery polling.
 * Correct answers and student identities are intentionally excluded.
 */
export async function loadQuizRealtimeSnapshot(
  quizId: string,
): Promise<QuizRealtimeSnapshot | null> {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true,
      status: true,
      currentQ: true,
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          question: true,
          optionA: true,
          optionB: true,
          optionC: true,
          optionD: true,
          timeLimit: true,
        },
      },
      players: {
        orderBy: [{ score: "desc" }, { joinedAt: "asc" }],
        select: { id: true, nickname: true, score: true },
      },
    },
  });
  if (!quiz) return null;

  const currentQuestion =
    quiz.currentQ >= 0 && quiz.currentQ < quiz.questions.length
      ? quiz.questions[quiz.currentQ]
      : null;
  const distribution = { ...EMPTY_DISTRIBUTION };
  let totalAnswers = 0;

  if (currentQuestion) {
    const grouped = await db.quizAnswer.groupBy({
      by: ["selected"],
      where: { questionId: currentQuestion.id },
      _count: { _all: true },
    });
    for (const row of grouped) {
      if (row.selected in distribution) {
        const key = row.selected as keyof typeof distribution;
        distribution[key] = row._count._all;
        totalAnswers += row._count._all;
      }
    }
  }

  return {
    version: 1,
    quizId: quiz.id,
    status: normalizeQuizStatus(quiz.status),
    currentQuestionIndex: quiz.currentQ,
    totalQuestions: quiz.questions.length,
    currentQuestion: currentQuestion
      ? {
          id: currentQuestion.id,
          index: quiz.currentQ,
          total: quiz.questions.length,
          text: currentQuestion.question,
          options: [
            currentQuestion.optionA,
            currentQuestion.optionB,
            currentQuestion.optionC,
            currentQuestion.optionD,
          ],
          timeLimit: currentQuestion.timeLimit,
        }
      : null,
    players: quiz.players,
    distribution,
    totalAnswers,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeQuizStatus(
  value: string,
): QuizRealtimeSnapshot["status"] {
  if (value === "active" || value === "finished") return value;
  return "waiting";
}
