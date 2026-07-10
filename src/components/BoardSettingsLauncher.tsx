"use client";

import { useEffect, useState } from "react";
import {
  BoardSettingsPanel,
  type BoardSection,
  type BoardTheme,
} from "./BoardSettingsPanel";
import type { AuraBoardSettings } from "./AuraEvaluationControl";
import type { SubjectOrder } from "@/lib/subject-order";
import {
  BOARD_SECTIONS_UPDATED_EVENT,
  type BoardSectionsUpdatedDetail,
} from "@/lib/board-section-events";

type Props = {
  boardId: string;
  layout: string;
  title?: string;
  classrooms?: Array<{
    id: string;
    name: string;
    studentCount: number;
  }>;
  classroomId?: string | null;
  thumbnailMode?: string | null;
  thumbnailUrl?: string | null;
  sections: BoardSection[];
  anonymousAuthor: boolean;
  boardTheme: BoardTheme;
  shareMode?: string;
  shareToken?: string | null;
  shareShortCode?: string | null;
  streamTitlePrompt?: string;
  streamContentPrompt?: string;
  streamSectionsEnabled?: boolean;
  auraSettings?: AuraBoardSettings;
  subjectOrder?: SubjectOrder | null;
  isAdmin?: boolean;
};

export function BoardSettingsLauncher({
  boardId,
  layout,
  title,
  classrooms,
  classroomId,
  thumbnailMode,
  thumbnailUrl,
  sections,
  anonymousAuthor,
  boardTheme,
  shareMode,
  shareToken,
  shareShortCode,
  streamTitlePrompt,
  streamContentPrompt,
  streamSectionsEnabled,
  auraSettings,
  subjectOrder,
  isAdmin,
}: Props) {
  const [open, setOpen] = useState(false);
  const [anonymousAuthorState, setAnonymousAuthorState] =
    useState(anonymousAuthor);
  const [sectionState, setSectionState] = useState(sections);

  useEffect(() => {
    setAnonymousAuthorState(anonymousAuthor);
  }, [anonymousAuthor]);

  useEffect(() => {
    setSectionState(sections);
  }, [sections]);

  useEffect(() => {
    function handleSectionsUpdated(event: Event) {
      const detail = (event as CustomEvent<BoardSectionsUpdatedDetail>).detail;
      if (!detail || detail.boardId !== boardId) return;
      setSectionState(detail.sections);
    }

    window.addEventListener(
      BOARD_SECTIONS_UPDATED_EVENT,
      handleSectionsUpdated,
    );
    return () => {
      window.removeEventListener(
        BOARD_SECTIONS_UPDATED_EVENT,
        handleSectionsUpdated,
      );
    };
  }, [boardId]);

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
          title={title}
          classrooms={classrooms}
          initialClassroomId={classroomId}
          initialThumbnailMode={thumbnailMode}
          initialThumbnailUrl={thumbnailUrl}
          boardId={boardId}
          layout={layout}
          initialSections={sectionState}
          initialAnonymousAuthor={anonymousAuthorState}
          initialBoardTheme={boardTheme}
          initialShareMode={shareMode}
          initialShareToken={shareToken}
          initialShareShortCode={shareShortCode}
          initialStreamTitlePrompt={streamTitlePrompt ?? ""}
          initialStreamContentPrompt={streamContentPrompt ?? ""}
          initialStreamSectionsEnabled={streamSectionsEnabled ?? false}
          initialAuraSettings={auraSettings}
          initialSubjectOrder={subjectOrder ?? null}
          isAdmin={isAdmin}
          onAnonymousAuthorChange={setAnonymousAuthorState}
        />
      )}
    </>
  );
}
