import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getEffectiveBoardRole } from "@/lib/rbac";
import {
  gameCatalogEntry,
  isOfficialPlayLayout,
} from "@/lib/game-platform/catalog";
import { loadGameSnapshot } from "@/lib/speed-game/runtime";
import { SpeedGameBoard } from "@/components/speed-game/SpeedGameBoard";
import { ShadowAllianceBoard } from "@/components/ShadowAllianceBoard";
import { OmokBoard } from "@/components/OmokBoard";
import { SongGuessBoard } from "@/components/SongGuessBoard";
import { KordleTeacherBoard } from "@/features/kordle/components/KordleTeacherBoard";
import { GameAreaShell } from "./GameAreaShell";
import styles from "./game-platform.module.css";

export type OfficialGameBoardProps = {
  board: {
    id: string;
    slug: string | null;
    title: string;
    layout: string;
    classroomId: string | null;
    systemGameKind?: string | null;
  };
  userId: string | null;
  student: { id: string; name: string; classroomId: string } | null;
  useStudentViewer: boolean;
};

export async function OfficialGameBoard({
  board,
  userId,
  student,
  useStudentViewer,
}: OfficialGameBoardProps) {
  if (!isOfficialPlayLayout(board.layout)) notFound();
  const role = await getEffectiveBoardRole(board.id, {
    userId: useStudentViewer ? undefined : userId ?? undefined,
    studentId: useStudentViewer ? student?.id : undefined,
  });
  const studentViewer =
    useStudentViewer &&
    student &&
    board.classroomId === student.classroomId
      ? student
      : null;
  const teacherCanRun = role === "owner" || role === "editor";
  const teacherCanView = teacherCanRun || role === "viewer";
  if (!studentViewer && !teacherCanView) notFound();

  const boardPath = `/board/${encodeURIComponent(board.slug ?? board.id)}`;
  const catalog = gameCatalogEntry(board.layout)!;
  const viewer = studentViewer ? "student" : "teacher";
  const actions = (
    <>
      {studentViewer ? (
        <Link className={styles.hudButton} href="/student/boards?category=records">
          나의 전적
        </Link>
      ) : null}
      <Link className={styles.hudButton} href={studentViewer ? "/student/boards?category=play" : "/dashboard"}>
        게임 목록
      </Link>
    </>
  );

  let content: React.ReactNode;
  switch (board.layout) {
    case "kordle":
      if (studentViewer) redirect(`${boardPath}/play/kordle`);
      if (!userId || !teacherCanRun) notFound();
      content = <KordleTeacherBoard boardId={board.id} teacherUserId={userId} />;
      break;
    case "speed-game": {
      const game = await db.speedGame.findUnique({
        where: { boardId: board.id },
        select: { id: true },
      });
      const initialGame = game ? await loadGameSnapshot(game.id) : null;
      content = (
        <SpeedGameBoard
          boardId={board.id}
          boardSlug={board.slug ?? board.id}
          classroomId={board.classroomId ?? ""}
          viewerKind={studentViewer ? "student" : teacherCanRun ? "teacher" : "none"}
          currentStudentId={studentViewer?.id ?? null}
          initialGame={initialGame}
        />
      );
      break;
    }
    case "shadow-alliance":
      content = (
        <ShadowAllianceBoard
          boardId={board.id}
          boardTitle={board.title}
          viewer={viewer}
        />
      );
      break;
    case "omok":
      content = (
        <OmokBoard
          boardId={board.id}
          boardTitle={board.title}
          viewer={viewer}
          matchmakingEnabled={board.systemGameKind === "omok"}
        />
      );
      break;
    case "song-guess":
      content = (
        <SongGuessBoard
          boardId={board.id}
          boardTitle={board.title}
          viewer={viewer}
        />
      );
      break;
  }

  // Purpose-built games own their complete game surface. The shared shell
  // duplicates their controls and constrains their wide game layouts.
  if (board.layout === "shadow-alliance" || board.layout === "omok") {
    return (
      <main data-board-category="PLAY" data-play-board="true">
        {content}
      </main>
    );
  }

  return (
    <main data-board-category="PLAY" data-play-board="true">
      <GameAreaShell
        title={board.title}
        rulesLabel={catalog.label}
        connection="online"
        actions={actions}
      >
        {content}
      </GameAreaShell>
    </main>
  );
}
