"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthHeader } from "./AuthHeader";
import { EditableTitle } from "./EditableTitle";
import { BoardSettingsLauncher } from "./BoardSettingsLauncher";
import { QrShareModal } from "./share/QrShareModal";
import { useBoardSlideshow } from "./slideshow/BoardSlideshowProvider";
import type { BoardSection, BoardTheme } from "./BoardSettingsPanel";

type Props = {
  boardId?: string;
  title: string;
  layout: string;
  isStudent?: boolean;
  backHref?: string;
  canEdit: boolean;
  classrooms?: Array<{
    id: string;
    name: string;
    studentCount: number;
  }>;
  classroomId?: string | null;
  thumbnailMode?: string | null;
  thumbnailUrl?: string | null;
  settingsSections?: BoardSection[];
  anonymousAuthor?: boolean;
  boardTheme?: BoardTheme;
  shareMode?: string;
  shareToken?: string | null;
  shareShortCode?: string | null;
  streamTitlePrompt?: string;
  streamContentPrompt?: string;
};

export function BoardHeader({
  boardId,
  title,
  layout,
  isStudent,
  backHref,
  canEdit,
  classrooms,
  classroomId,
  thumbnailMode,
  thumbnailUrl,
  settingsSections,
  anonymousAuthor,
  boardTheme,
  shareMode,
  shareToken,
  shareShortCode,
  streamTitlePrompt,
  streamContentPrompt,
}: Props) {
  const [showQr, setShowQr] = useState(false);
  const isShared = shareMode && shareMode !== "private" && !!shareToken;
  const { canOpen, openSlideshow } = useBoardSlideshow();

  return (
    <header className="board-header">
      <div className="board-header-left">
        <Link
          href={backHref ?? "/"}
          className="board-back-link"
          aria-label="보드 목록으로"
        >
          ←
        </Link>
        {boardId ? (
          <EditableTitle boardId={boardId} initialTitle={title} canEdit={canEdit} />
        ) : (
          <h1 className="board-title">{title}</h1>
        )}
        {boardId && canEdit && (
          <BoardSettingsLauncher
            boardId={boardId}
            layout={layout}
            title={title}
            classrooms={classrooms}
            classroomId={classroomId}
            thumbnailMode={thumbnailMode}
            thumbnailUrl={thumbnailUrl}
            sections={settingsSections ?? []}
            anonymousAuthor={anonymousAuthor ?? false}
            boardTheme={boardTheme ?? "pastel-sky"}
            shareMode={shareMode}
            shareToken={shareToken}
            shareShortCode={shareShortCode}
            streamTitlePrompt={streamTitlePrompt ?? ""}
            streamContentPrompt={streamContentPrompt ?? ""}
          />
        )}
        {canOpen && (
          <button
            type="button"
            className="board-slideshow-trigger"
            onClick={() => openSlideshow()}
            aria-label="슬라이드쇼 시작"
          >
            슬라이드쇼
          </button>
        )}
      </div>
      <div className="board-header-right">
        {!isStudent && boardId && isShared && (
          <button
            type="button"
            className="board-share-btn"
            aria-label="공유 보기"
            onClick={() => setShowQr(true)}
            title="공유"
          >
            <span aria-hidden="true">🔗</span>
            <span className="board-share-badge">공유됨</span>
          </button>
        )}
        <AuthHeader />
      </div>

      {showQr && boardId && shareToken && (
        <QrShareModal
          boardId={boardId}
          shareToken={shareToken}
          shareShortCode={shareShortCode}
          onClose={() => setShowQr(false)}
        />
      )}
    </header>
  );
}
