import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { BoardHeader } from "@/components/BoardHeader";
import { KordleBoard } from "@/features/kordle/components/KordleBoard";
import { KordleLiveToasts } from "@/features/kordle/components/KordleLiveToasts";
import { KordleWaitingRoom } from "@/features/kordle/components/KordleWaitingRoom";
import { ensureAttempt, getPublicState } from "@/features/kordle/server/kordleServer";
import type { BoardTheme } from "@/components/BoardSettingsPanel";
import "@/features/kordle/components/kordle.css";

type Props = { params: Promise<{ id: string }> };

function normalizeBoardTheme(value: string | null | undefined): BoardTheme {
  switch (value) {
    case "pastel-peach":
    case "pastel-mint":
    case "pastel-sky":
    case "pastel-lilac":
    case "pastel-lemon":
      return value;
    default:
      return "pastel-sky";
  }
}

// BC-2: a Kordle play page. Student-facing daily play surface. If a
// teacher hits this URL we redirect to the board page so the same link
// works in both contexts.
export default async function KordlePlayPage({ params }: Props) {
  const { id } = await params;
  const boardIdOrSlug = id;

  // StudentDashboard links to /board/${board.slug}/play/kordle, so the
  // dynamic segment can be either a board id or a slug. Resolve to the
  // canonical board row first; the Kordle game is keyed by boardId.
  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: {
      id: true,
      slug: true,
      title: true,
      layout: true,
      boardTheme: true,
      classroomId: true,
      classroom: { select: { teacherId: true } },
    },
  });
  if (!board) notFound();
  const boardId = board.id;
  const boardTheme = normalizeBoardTheme(board.boardTheme);

  const student = await getCurrentStudent();
  if (!student) {
    // Teacher fallback: same link, no student session.
    const user = await getCurrentUser();
    if (user && board.classroom?.teacherId === user.id) {
      redirect(`/board/${board.slug ?? boardId}`);
    }
    notFound();
  }
  if (board.classroomId !== student.classroomId) {
    notFound();
  }

  const game = await db.kordleGame.findUnique({
    where: { boardId },
    select: {
      locale: true,
      puzzles: {
        where: { status: { in: ["DRAFT", "LIVE"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!game) notFound();
  const puzzle = game.puzzles[0];
  if (!puzzle) {
    return (
      <main className="board-page kordle-waiting-page" data-board-theme={boardTheme}>
        <BoardHeader
          boardId={boardId}
          title={board.title}
          layout={board.layout}
          isStudent
          backHref="/student"
          canEdit={false}
          showAuth={false}
        />
        <KordleWaitingRoom
          boardId={boardId}
          studentId={student.id}
          studentName={student.name}
        />
      </main>
    );
  }

  const attemptId = await ensureAttempt({
    puzzleId: puzzle.id,
    studentId: student.id,
    vibePlaySessionId: null,
    teacherUserId: null,
  });

  const livePuzzle = await db.kordlePuzzle.findUnique({
    where: { id: puzzle.id },
    select: { status: true },
  });
  if (livePuzzle?.status !== "LIVE") {
    return (
      <main className="board-page kordle-waiting-page" data-board-theme={boardTheme}>
        <BoardHeader
          boardId={boardId}
          title={board.title}
          layout={board.layout}
          isStudent
          backHref="/student"
          canEdit={false}
          showAuth={false}
        />
        <KordleWaitingRoom
          boardId={boardId}
          studentId={student.id}
          studentName={student.name}
        />
      </main>
    );
  }

  const state = await getPublicState({ attemptId, studentId: student.id });
  if (!state) notFound();

  return (
    <main className="board-page kordle-play-page" data-board-theme={boardTheme}>
      <BoardHeader
        boardId={boardId}
        title={board.title}
        layout={board.layout}
        isStudent
        backHref="/student"
        canEdit={false}
        showAuth={false}
      />
      <KordleBoard
        boardId={boardId}
        attemptId={attemptId}
        initialState={state}
        locale={game.locale}
      />
      <KordleLiveToasts boardId={boardId} />
    </main>
  );
}
