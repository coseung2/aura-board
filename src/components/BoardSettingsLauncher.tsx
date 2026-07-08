"use client";

import { useEffect, useState } from "react";
import {
  BoardSettingsPanel,
  type BoardSection,
  type BoardTheme,
} from "./BoardSettingsPanel";
import type { AuraBoardSettings } from "./AuraEvaluationControl";
import type { SubjectOrder } from "@/lib/subject-order";

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
}: Props) {
  const [open, setOpen] = useState(false);
  const [anonymousAuthorState, setAnonymousAuthorState] =
    useState(anonymousAuthor);

  useEffect(() => {
    setAnonymousAuthorState(anonymousAuthor);
  }, [anonymousAuthor]);

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
          initialSections={sections}
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
          onAnonymousAuthorChange={setAnonymousAuthorState}
        />
      )}
    </>
  );
}
