import { db } from "./db";
import type { Identities } from "./card-permissions";

/**
 * Teacher-scoped quiz management check (quiz-extensions B1/B3/B4).
 *
 * A teacher may manage a quiz iff they own or edit the board that quiz lives
 * on. No separate Quiz.createdById column — access to the quiz derives from
 * the teacher's membership on the host board.
 *
 * Students and parents always return false — quiz management is
 * teacher-only. Use canAddCardToBoard for draft/create (board-level).
 */
export async function canManageQuiz(
  quizId: string,
  ids: Identities
): Promise<boolean> {
  if (!ids.teacher) return false;
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: { boardId: true },
  });
  if (!quiz) return false;
  if (ids.teacher.ownsBoardIds.has(quiz.boardId)) return true;

  const membership = await db.boardMember.findUnique({
    where: {
      boardId_userId: {
        boardId: quiz.boardId,
        userId: ids.teacher.userId,
      },
    },
    select: { role: true },
  });
  return membership?.role === "owner" || membership?.role === "editor";
}
