/**
 * ShareBoardWrapper — Renders the real board component (BoardCanvas, GridBoard,
 * etc.) for a share-link visitor instead of the old BoardShareView.
 *
 * Props mirror what the main student board page passes to each layout
 * component, but with share-token-aware API identity.
 *
 * The wrapper provides a React Context so child components can retrieve the
 * shareToken for API calls (PATCH /api/cards/:id, POST /api/cards, etc.)
 * by adding the x-share-token header.
 */
"use client";

import { BoardCanvas } from "../BoardCanvas";
import { GridBoard } from "../GridBoard";
import { StreamBoard } from "../StreamBoard";
import { ColumnsBoard } from "../ColumnsBoard";
import { BoardHeader } from "../BoardHeader";
import type { CardData } from "../DraggableCard";
import { ShareSessionProvider } from "./ShareSessionContext";
export { useShareFetch, useShareSession } from "./ShareSessionContext";

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
    boardTheme: string | null;
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
