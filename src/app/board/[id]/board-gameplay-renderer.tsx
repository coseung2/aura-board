import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { SpeedGameWire } from "@/components/speed-game/types";
import { QuizBoard } from "@/components/QuizBoard";
import { AssessmentBoard } from "@/components/assessment/AssessmentBoard";
import { VibeArcadeBoard } from "@/components/VibeArcadeBoard";
import { VibeGalleryBoard } from "@/components/VibeGalleryBoard";
import { QuestionBoard } from "@/components/QuestionBoard";
import { SpeedGameBoard } from "@/components/speed-game/SpeedGameBoard";
import { ShadowAllianceBoard } from "@/components/ShadowAllianceBoard";
import { OmokBoard } from "@/components/OmokBoard";
import { SongGuessBoard } from "@/components/SongGuessBoard";
import { KordleTeacherBoard } from "@/features/kordle/components/KordleTeacherBoard";

type QuizRow = {
  id: string;
  title: string;
  roomCode: string;
  status: string;
  currentQ: number;
  questions: Array<{
    id: string;
    question: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    answer: string;
    timeLimit: number;
  }>;
  players: Array<{ id: string; nickname: string; score: number }>;
};

type GameplayBoardInput = {
  board: {
    id: string;
    slug: string | null;
    title: string;
    layout: string;
    classroomId: string | null;
    questionPrompt: string | null;
    questionVizMode: string | null;
  };
  effectiveRole: "owner" | "editor" | "viewer" | null;
  studentViewer: { id: string } | null;
  userId: string | null;
  quizzes: QuizRow[];
  speedGameInitial: SpeedGameWire | null;
};

export function renderGameplayBoard({
  board,
  effectiveRole,
  studentViewer,
  userId,
  quizzes,
  speedGameInitial,
}: GameplayBoardInput): ReactNode | undefined {
  const user = userId ? { id: userId } : null;
  switch (board.layout) {
    case "quiz": {
      const answerToIndex: Record<string, number> = {
        A: 0,
        B: 1,
        C: 2,
        D: 3,
      };
      return (
        <QuizBoard
          boardId={board!.id}
          quizzes={quizzes.map((q) => ({
            id: q.id,
            title: q.title,
            roomCode: q.roomCode,
            status: q.status as "waiting" | "active" | "finished",
            currentQuestionIndex: q.currentQ,
            questions: q.questions.map((qn) => ({
              id: qn.id,
              text: qn.question,
              options: [qn.optionA, qn.optionB, qn.optionC, qn.optionD],
              correctIndex: answerToIndex[qn.answer] ?? 0,
              timeLimit: qn.timeLimit,
            })),
            players: q.players.map((p) => ({
              id: p.id,
              nickname: p.nickname,
              score: p.score,
            })),
          }))}
        />
      );
    }
    case "assessment": {
      const viewerKind: "teacher" | "student" | "none" = studentViewer
        ? "student"
        : effectiveRole === "owner"
          ? "teacher"
          : "none";
      return (
        <AssessmentBoard
          boardId={board!.id}
          classroomId={board!.classroomId ?? ""}
          viewerKind={viewerKind}
        />
      );
    }
    case "vibe-arcade": {
      const viewerKind: "teacher" | "student" | "none" = studentViewer
        ? "student"
        : effectiveRole === "owner" || effectiveRole === "editor"
          ? "teacher"
          : "none";
      return (
        <VibeArcadeBoard
          boardId={board!.id}
          classroomId={board!.classroomId ?? ""}
          viewerKind={viewerKind}
          studentId={studentViewer?.id ?? null}
        />
      );
    }
    case "vibe-gallery": {
      // 2026-04-21: vibe-arcade studio에서 승인된 프로젝트를 전시하는 별도 보드.
      // classroom 내부에서 큐레이션 가능 + 다른 학급이 옆 보드에서 감상.
      const viewerKind: "teacher" | "student" | "none" = studentViewer
        ? "student"
        : effectiveRole === "owner" || effectiveRole === "editor"
          ? "teacher"
          : "none";
      return (
        <VibeGalleryBoard
          boardId={board!.id}
          classroomId={board!.classroomId ?? ""}
          viewerKind={viewerKind}
        />
      );
    }
    case "question-board": {
      const viewerKind: "teacher" | "student" | "none" = studentViewer
        ? "student"
        : effectiveRole === "owner" || effectiveRole === "editor"
          ? "teacher"
          : "none";
      return (
        <QuestionBoard
          boardId={board!.id}
          boardSlug={board!.slug ?? board!.id}
          initialPrompt={board!.questionPrompt ?? null}
          initialVizMode={
            (board!.questionVizMode as
              | "word-cloud"
              | "bar"
              | "pie"
              | "timeline"
              | "list") ?? "word-cloud"
          }
          viewerKind={viewerKind}
          currentStudentId={studentViewer?.id ?? null}
        />
      );
    }
    case "speed-game": {
      const viewerKind: "teacher" | "student" | "none" = studentViewer
        ? "student"
        : effectiveRole === "owner" || effectiveRole === "editor"
          ? "teacher"
          : "none";
      return (
        <SpeedGameBoard
          boardId={board!.id}
          boardSlug={board!.slug ?? board!.id}
          classroomId={board!.classroomId ?? ""}
          viewerKind={viewerKind}
          currentStudentId={studentViewer?.id ?? null}
          initialGame={speedGameInitial}
        />
      );
    }
    case "shadow-alliance": {
      const viewer = studentViewer
        ? "student"
        : effectiveRole === "owner" || effectiveRole === "editor"
          ? "teacher"
          : null;
      return viewer ? (
        <ShadowAllianceBoard
          boardId={board!.id}
          boardTitle={board!.title}
          viewer={viewer}
        />
      ) : null;
    }
    case "omok": {
      const viewer = studentViewer
        ? "student"
        : effectiveRole === "owner" || effectiveRole === "editor"
          ? "teacher"
          : null;
      return viewer ? (
        <OmokBoard
          boardId={board!.id}
          boardTitle={board!.title}
          viewer={viewer}
        />
      ) : null;
    }
    case "song-guess": {
      const viewer = studentViewer
        ? "student"
        : effectiveRole === "owner" || effectiveRole === "editor"
          ? "teacher"
          : null;
      return viewer ? (
        <SongGuessBoard
          boardId={board!.id}
          boardTitle={board!.title}
          viewer={viewer}
        />
      ) : null;
    }
    case "kordle": {
      if (studentViewer) {
        redirect(`/board/${board!.slug ?? board!.id}/play/kordle`);
      }
      return (
        <KordleTeacherBoard boardId={board!.id} teacherUserId={user!.id} />
      );
    }
    default:
      return undefined;
  }
}
