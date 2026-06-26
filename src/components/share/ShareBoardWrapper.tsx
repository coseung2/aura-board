/**
 * ShareBoardWrapper — Renders the real board component (BoardCanvas, GridBoard,
 * etc.) for a share-link visitor instead of the old BoardShareView.
 *
 * Props mirror what the main student board page passes to each layout
 * component, but with share-token-aware API identity.
 *
 * The wrapper provides a React Context so child components can retrieve the
 * shareToken for API calls by adding the x-share-token header.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BoardCanvas } from "../BoardCanvas";
import { GridBoard } from "../GridBoard";
import { StreamBoard } from "../StreamBoard";
import { ColumnsBoard } from "../ColumnsBoard";
import { BoardHeader } from "../BoardHeader";
import type { CardData } from "../DraggableCard";
import { ShareSessionProvider } from "./ShareSessionContext";
import type {
  StreamActivityTemplate,
  StreamActivityTemplateState,
} from "@/lib/stream-activity-templates";
export { useShareFetch, useShareSession } from "./ShareSessionContext";

// ─── Props ─────────────────────────────────────────────────────────────────

export type BoardSection = {
  id: string;
  title: string;
  order: number;
  pinned: boolean;
  sortMode: string | null;
  activityTemplate?: StreamActivityTemplate | null;
  activityTemplateState?: StreamActivityTemplateState | null;
  accessToken: string | null;
};

type Props = {
  board: {
    id: string;
    title: string;
    layout: string;
    description: string | null;
    slug: string | null;
    anonymousAuthor: boolean;
    boardTheme: string | null;
    streamSectionsEnabled?: boolean;
  };
  initialCards: CardData[];
  initialSections: BoardSection[];
  shareMode: "student";
  shareToken: string;
};

// ─── Component ─────────────────────────────────────────────────────────────

export function ShareBoardWrapper({
  board,
  initialCards,
  initialSections,
  shareMode,
  shareToken,
}: Props) {
  const router = useRouter();
  const [cloneStatus, setCloneStatus] = useState<
    "idle" | "loading" | "loginRequired" | "error"
  >("idle");
  const [cloneError, setCloneError] = useState<string | null>(null);

  async function handleClone() {
    if (cloneStatus === "loading") return;
    setCloneStatus("loading");
    setCloneError(null);

    try {
      const res = await fetch(
        `/api/share/boards/${encodeURIComponent(shareToken)}/clone`,
        {
          method: "POST",
          headers: { accept: "application/json" },
        },
      );

      if (res.status === 401) {
        setCloneStatus("loginRequired");
        return;
      }

      if (res.status === 404) {
        setCloneStatus("error");
        setCloneError("공유 보드를 찾을 수 없어요.");
        return;
      }

      if (res.status === 400) {
        setCloneStatus("error");
        setCloneError("이 보드 형식은 아직 복제를 지원하지 않아요.");
        return;
      }

      if (!res.ok) {
        setCloneStatus("error");
        setCloneError("보드 복제에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }

      const data = (await res.json()) as { boardUrl?: string };
      if (data.boardUrl) {
        router.push(data.boardUrl);
      } else {
        setCloneStatus("error");
        setCloneError("복제된 보드로 이동할 수 없어요.");
      }
    } catch {
      setCloneStatus("error");
      setCloneError("보드 복제 중 오류가 발생했어요.");
    }
  }

  const role = "viewer" as const;
  const canEdit = false;
  const isStudentViewer = true;

  // Normalize boardTheme same as src/app/board/[id]/page.tsx
  const normalizeBoardTheme = (value: string | null | undefined): "pastel-peach" | "pastel-mint" | "pastel-sky" | "pastel-lilac" | "pastel-lemon" => {
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
  };
  const boardTheme = normalizeBoardTheme(board.boardTheme);

  // Layout dispatch mirrors src/app/board/[id]/page.tsx
  function renderBoard() {
    switch (board.layout) {
      case "freeform":
        return (
          <BoardCanvas
            boardId={board.id}
            initialCards={initialCards}
            currentUserId={shareToken}
            currentRole={role}
            classroomId={null}
            isStudentViewer={isStudentViewer}
          />
        );

      case "grid":
        return (
          <GridBoard
            boardId={board.id}
            initialCards={initialCards}
            currentUserId={shareToken}
            currentRole={role}
            classroomId={null}
            isStudentViewer={isStudentViewer}
          />
        );

      case "stream":
        return (
          <StreamBoard
            boardId={board.id}
            initialCards={initialCards}
            currentUserId={shareToken}
            currentRole={role}
            classroomId={null}
            isStudentViewer={isStudentViewer}
            initialSections={initialSections}
            streamSectionsEnabled={!!board.streamSectionsEnabled}
          />
        );

      case "columns":
        return (
          <ColumnsBoard
            boardId={board.id}
            initialCards={initialCards}
            initialSections={initialSections}
            currentUserId={shareToken}
            currentRole={role}
            classroomId={null}
            isStudentViewer={isStudentViewer}
          />
        );

      // Special layouts (assignment, quiz, drawing, etc.) are teacher-only
      // or require classroom context — show a simplified student-style card view.
      default:
        // Render a read-only board with the freeform canvas.
        return (
          <BoardCanvas
            boardId={board.id}
            initialCards={initialCards}
            currentUserId={shareToken}
            currentRole={role}
            classroomId={null}
            isStudentViewer={isStudentViewer}
          />
        );
    }
  }

  return (
    <ShareSessionProvider shareToken={shareToken} shareMode={shareMode}>
      <main className="board-page" data-board-theme={boardTheme}>
        <div className="share-clone-bar" role="region" aria-label="공유 보드 액션">
          {cloneStatus === "loginRequired" ? (
            <p className="share-clone-message">
              복제하려면 <a href="/login">로그인</a>이 필요해요.
            </p>
          ) : cloneStatus === "error" && cloneError ? (
            <p className="share-clone-message share-clone-message-error" role="alert">
              {cloneError}
            </p>
          ) : null}
          <button
            type="button"
            className="ds-btn-primary share-clone-btn"
            onClick={handleClone}
            disabled={cloneStatus === "loading"}
            aria-busy={cloneStatus === "loading"}
          >
            {cloneStatus === "loading" ? "복제하는 중..." : "내 보드로 복제"}
          </button>
        </div>
        <BoardHeader
          title={board.title}
          layout={board.layout}
          canEdit={canEdit}
        />
        {renderBoard()}
      </main>
    </ShareSessionProvider>
  );
}
