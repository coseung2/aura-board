/**
 * ShareBoardWrapper — Renders the real board component (BoardCanvas, GridBoard,
 * etc.) for a share-link visitor instead of the old BoardShareView.
 *
 * Props mirror what the main board page passes to each layout component,
 * but with share-token-aware role mapping instead of teacher/student auth.
 *
 * The wrapper provides a React Context so child components can retrieve the
 * shareToken for API calls (PATCH /api/cards/:id, POST /api/cards, etc.)
 * by adding the x-share-token header.
 */
"use client";

import { createContext, useContext, useCallback } from "react";
import { BoardCanvas } from "../BoardCanvas";
import { GridBoard } from "../GridBoard";
import { StreamBoard } from "../StreamBoard";
import { ColumnsBoard } from "../ColumnsBoard";
import { BoardHeader } from "../BoardHeader";
import type { CardData } from "../DraggableCard";

// ─── Context ───────────────────────────────────────────────────────────────

type ShareSession = {
  shareToken: string;
  shareMode: "view" | "comment" | "edit";
};

const ShareSessionContext = createContext<ShareSession | null>(null);

export function useShareSession(): ShareSession | null {
  return useContext(ShareSessionContext);
}

/**
 * Hook that wraps fetch calls with the share-token header.
 * Pass the same args as the standard fetch().
 *
 *   const shareFetch = useShareFetch();
 *   const res = await shareFetch("/api/cards/abc", { method: "PATCH", body: ... });
 */
export function useShareFetch() {
  const session = useContext(ShareSessionContext);
  return useCallback(
    (url: string | URL, init?: RequestInit) => {
      return fetch(url, {
        ...init,
        headers: {
          ...init?.headers,
          ...(session ? { "x-share-token": session.shareToken } : {}),
        },
      });
    },
    [session],
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────

export type BoardSection = {
  id: string;
  title: string;
  order: number;
  pinned: boolean;
  sortMode: string | null;
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
  };
  initialCards: CardData[];
  initialSections: BoardSection[];
  shareMode: "view" | "comment" | "edit";
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
  const isEditable = shareMode === "edit";
  // Map shareMode to the role system: "edit" → editor, otherwise viewer.
  const role = isEditable ? "editor" : "viewer";
  const canEdit = isEditable;

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
            isStudentViewer={false}
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
            isStudentViewer={false}
          />
        );

      // Special layouts (assignment, quiz, drawing, etc.) are teacher-only
      // or require classroom context — show a simplified card view.
      default:
        // Render a read-only board with the freeform canvas.
        return (
          <BoardCanvas
            boardId={board.id}
            initialCards={initialCards}
            currentUserId={shareToken}
            currentRole="viewer"
            classroomId={null}
            isStudentViewer={false}
          />
        );
    }
  }

  return (
    <ShareSessionContext.Provider value={{ shareToken, shareMode }}>
      <main className="share-board-page">
        <BoardHeader
          title={board.title}
          layout={board.layout}
          canEdit={canEdit}
        />
        <div className="share-board-content">{renderBoard()}</div>
      </main>
    </ShareSessionContext.Provider>
  );
}
