import type { ComponentProps, ReactNode } from "react";

import { BoardHeader } from "@/components/BoardHeader";
import { BoardVisitTracker } from "@/components/BoardVisitTracker";
import { BoardSlideshowProvider } from "@/components/slideshow/BoardSlideshowProvider";

type BoardHeaderProps = ComponentProps<typeof BoardHeader>;

type Props = {
  board: {
    id: string;
    title: string;
    layout: string;
    category: string;
    classroomId: string | null;
    thumbnailMode: string;
    thumbnailUrl?: string | null;
    anonymousAuthor: boolean;
    shareMode: string;
    shareToken: string | null;
    shareShortCode: string | null;
    streamTitlePrompt: string | null;
    streamContentPrompt: string | null;
    streamSectionsEnabled: boolean;
  };
  isAdmin: boolean;
  isStudent: boolean;
  effectiveRole: "owner" | "editor" | "viewer" | null;
  settingsClassrooms: BoardHeaderProps["classrooms"];
  settingsSections: BoardHeaderProps["settingsSections"];
  boardTheme: BoardHeaderProps["boardTheme"];
  auraSettings: BoardHeaderProps["auraSettings"];
  subjectOrder: BoardHeaderProps["subjectOrder"];
  children: ReactNode;
};

export function BoardPageChrome({
  board,
  isAdmin,
  isStudent,
  effectiveRole,
  settingsClassrooms,
  settingsSections,
  boardTheme,
  auraSettings,
  subjectOrder,
  children,
}: Props) {
  const isPlayBoard = board.category === "PLAY";
  return (
    <BoardSlideshowProvider key={board.id}>
      <main
        className="board-page"
        data-board-theme={boardTheme}
        data-play-board={isPlayBoard ? "true" : undefined}
        data-board-category={board.category}
      >
        <BoardVisitTracker boardId={board.id} />
        {!isPlayBoard && (
          <BoardHeader
            boardId={board.id}
            title={board.title}
            layout={board.layout}
            isAdmin={isAdmin}
            isStudent={isStudent}
            backHref={isStudent ? "/student" : "/dashboard"}
            canEdit={effectiveRole === "owner" || effectiveRole === "editor"}
            classrooms={settingsClassrooms}
            classroomId={board.classroomId}
            thumbnailMode={board.thumbnailMode}
            thumbnailUrl={board.thumbnailUrl ?? null}
            settingsSections={settingsSections}
            anonymousAuthor={board.anonymousAuthor}
            boardTheme={boardTheme}
            shareMode={board.shareMode}
            shareToken={board.shareToken}
            shareShortCode={board.shareShortCode}
            streamTitlePrompt={board.streamTitlePrompt ?? ""}
            streamContentPrompt={board.streamContentPrompt ?? ""}
            streamSectionsEnabled={board.streamSectionsEnabled}
            auraSettings={auraSettings}
            subjectOrder={subjectOrder}
            showAuth={false}
          />
        )}
        {children}
      </main>
    </BoardSlideshowProvider>
  );
}
