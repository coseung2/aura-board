import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { PlayBoardContinueButton } from "@/components/PlayBoardContinueButton";
import { GameAreaShell } from "@/components/game-platform/GameAreaShell";
import { KordleBoard } from "@/features/kordle/components/KordleBoard";
import { KordleLiveToasts } from "@/features/kordle/components/KordleLiveToasts";
import { KordleWaitingRoom } from "@/features/kordle/components/KordleWaitingRoom";
import { ensureAttempt, getPublicState } from "@/features/kordle/server/kordleServer";
import "@/features/kordle/components/kordle.css";

type Props = { params: Promise<{ id: string }> };

function WaitingShell({
  boardId,
  boardTitle,
  studentId,
  studentName,
}: {
  boardId: string;
  boardTitle: string;
  studentId: string;
  studentName: string;
}) {
  return (
    <GameAreaShell
      title={`🟩 ${boardTitle}`}
      rulesLabel="꼬들"
      actions={<PlayBoardContinueButton />}
    >
      <KordleWaitingRoom
        boardId={boardId}
        studentId={studentId}
        studentName={studentName}
      />
    </GameAreaShell>
  );
}

export default async function KordlePlayPage({ params }: Props) {
  const { id: boardIdOrSlug } = await params;
  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: {
      id: true,
      slug: true,
      title: true,
      layout: true,
      classroomId: true,
      classroom: { select: { teacherId: true } },
    },
  });
  if (!board || board.layout !== "kordle") notFound();

  const student = await getCurrentStudent();
  if (!student) {
    const user = await getCurrentUser();
    if (user && board.classroom?.teacherId === user.id) {
      redirect(`/board/${board.slug ?? board.id}`);
    }
    notFound();
  }
  if (board.classroomId !== student.classroomId) notFound();

  const game = await db.kordleGame.findUnique({
    where: { boardId: board.id },
    select: {
      locale: true,
      puzzles: {
        where: { status: { in: ["DRAFT", "LIVE"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true },
      },
    },
  });
  if (!game) notFound();
  const puzzle = game.puzzles[0];
  if (!puzzle || puzzle.status !== "LIVE") {
    return (
      <WaitingShell
        boardId={board.id}
        boardTitle={board.title}
        studentId={student.id}
        studentName={student.name}
      />
    );
  }

  const attemptId = await ensureAttempt({
    puzzleId: puzzle.id,
    studentId: student.id,
    vibePlaySessionId: null,
    teacherUserId: null,
  });
  const state = await getPublicState({
    attemptId,
    studentId: student.id,
    vibePlaySessionId: null,
    teacherUserId: null,
  });
  if (!state) notFound();

  return (
    <GameAreaShell
      title={`🟩 ${board.title}`}
      roundLabel={
        state.turn.currentGuessIndex
          ? `${state.turn.currentGuessIndex}/${state.maxGuesses}줄`
          : null
      }
      rulesLabel="꼬들"
      actions={<PlayBoardContinueButton />}
    >
      <KordleBoard
        boardId={board.id}
        attemptId={attemptId}
        initialState={state}
        locale={game.locale}
        viewer="student"
      />
      <KordleLiveToasts boardId={board.id} />
    </GameAreaShell>
  );
}
