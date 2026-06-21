"use client";

import { useState } from "react";
import {
  BoardSettingsPanel,
  type BoardSection,
  type BoardTheme,
} from "./BoardSettingsPanel";

type Props = {
  boardId: string;
  layout: string;
  sections: BoardSection[];
  anonymousAuthor: boolean;
  boardTheme: BoardTheme;
  shareMode?: string;
  shareToken?: string | null;
  shareShortCode?: string | null;
  streamTitlePrompt?: string;
  streamContentPrompt?: string;
};

export function BoardSettingsLauncher({
  boardId,
  layout,
  sections,
  anonymousAuthor,
  boardTheme,
  shareMode,
  shareToken,
  shareShortCode,
  streamTitlePrompt,
  streamContentPrompt,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="board-settings-trigger"
        aria-label="보드 설정 열기"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        보드 설정
      </button>
      {open && (
        <BoardSettingsPanel
          open={open}
          onClose={() => setOpen(false)}
          boardId={boardId}
          layout={layout}
          initialSections={sections}
          initialAnonymousAuthor={anonymousAuthor}
          initialBoardTheme={boardTheme}
          initialShareMode={shareMode}
          initialShareToken={shareToken}
          initialShareShortCode={shareShortCode}
          initialStreamTitlePrompt={streamTitlePrompt ?? ""}
          initialStreamContentPrompt={streamContentPrompt ?? ""}
        />
      )}
    </>
  );
}
