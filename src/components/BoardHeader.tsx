"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthHeader } from "./AuthHeader";
import { EditableTitle } from "./EditableTitle";
import { BoardSettingsLauncher } from "./BoardSettingsLauncher";
import { QrShareModal } from "./share/QrShareModal";
import type { BoardSection, BoardTheme } from "./BoardSettingsPanel";

type Props = {
  boardId?: string;
  title: string;
  layout: string;
  isStudent?: boolean;
  backHref?: string;
  canEdit: boolean;
  settingsSections?: BoardSection[];
  anonymousAuthor?: boolean;
  boardTheme?: BoardTheme;
  shareMode?: string;
  shareToken?: string | null;
  shareShortCode?: string | null;
};

export function BoardHeader({
  boardId,
  title,
  layout,
  isStudent,
  backHref,
  canEdit,
  settingsSections,
  anonymousAuthor,
  boardTheme,
  shareMode,
  shareToken,
  shareShortCode,
}: Props) {
  const [showQr, setShowQr] = useState(false);
  const isShared = shareMode && shareMode !== "private" && !!shareToken;

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
            sections={settingsSections ?? []}
            anonymousAuthor={anonymousAuthor ?? false}
            boardTheme={boardTheme ?? "pastel-sky"}
            shareMode={shareMode}
            shareToken={shareToken}
            shareShortCode={shareShortCode}
          />
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
