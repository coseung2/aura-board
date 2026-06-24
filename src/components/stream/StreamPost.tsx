"use client";

import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/card-engagement-format";
import { extractVideoId } from "@/lib/youtube";
import { CardFileAttachment } from "../CardFileAttachment";
import type { CardData } from "../DraggableCard";
import { getStreamAuthor } from "./stream-author";
import { StreamEngagement } from "./StreamEngagement";
import { StreamLinkPreview } from "./StreamLinkPreview";
import { StreamMediaCarousel } from "./StreamMediaCarousel";

type Props = {
  card: CardData;
  canEdit: boolean;
  onEdit: () => void;
  canDelete: boolean;
  onDelete: () => void;
  canToggleGuide?: boolean;
  guideBusy?: boolean;
  onToggleGuide?: (pinned: boolean) => void;
  boardId?: string;
};

export function StreamPost({
  card,
  canEdit,
  onEdit,
  canDelete,
  onDelete,
  canToggleGuide = false,
  guideBusy = false,
  onToggleGuide,
  boardId,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const author = getStreamAuthor(card);
  const fileAttachments = (card.attachments ?? []).filter((item) => item.kind === "file");
  const isYouTubeVideo = Boolean(card.linkUrl && extractVideoId(card.linkUrl));
  const isArticleLink = Boolean(card.linkUrl && !isYouTubeVideo);
  const [resolvedYouTubeTitle, setResolvedYouTubeTitle] = useState<string | null>(null);
  const displayTitle =
    isYouTubeVideo && card.linkTitle?.trim()
      ? card.linkTitle.trim()
      : isYouTubeVideo && resolvedYouTubeTitle
        ? resolvedYouTubeTitle
      : isArticleLink && card.linkTitle?.trim()
        ? card.linkTitle.trim()
      : card.title.trim();

  useEffect(() => {
    if (!isYouTubeVideo || card.linkTitle?.trim() || !card.linkUrl) {
      setResolvedYouTubeTitle(null);
      return;
    }
    let alive = true;
    fetch(`/api/link-preview?url=${encodeURIComponent(card.linkUrl)}`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { title?: string | null } | null) => {
        if (!alive) return;
        setResolvedYouTubeTitle(data?.title?.trim() || null);
      })
      .catch(() => {
        if (alive) setResolvedYouTubeTitle(null);
      });
    return () => {
      alive = false;
    };
  }, [card.linkTitle, card.linkUrl, isYouTubeVideo]);

  return (
    <article className={`stream-post${card.guidePinned ? " is-guide" : ""}`}>
      <header className="stream-post-head">
        <div
          className="stream-avatar"
          style={{ backgroundColor: author.avatarColor }}
          aria-hidden="true"
        >
          {author.avatarText}
        </div>
        <div className="stream-author-copy">
          <strong>
            {author.displayName}
            {card.guidePinned && (
              <span className="stream-post-guide-chip">가이드</span>
            )}
          </strong>
          <time>{formatRelativeTime(card.createdAt ?? new Date().toISOString())}</time>
        </div>
        {(canEdit || canDelete || canToggleGuide) && (
          <div className="stream-post-menu">
            <button
              type="button"
              className="stream-post-menu-toggle"
              aria-label="게시글 메뉴"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="stream-post-menu-popover">
                {canEdit && (
                  <button
                    type="button"
                    className="stream-post-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit();
                    }}
                  >
                    수정
                  </button>
                )}
                {canToggleGuide && (
                  <button
                    type="button"
                    className="stream-post-menu-item"
                    disabled={guideBusy}
                    onClick={() => {
                      setMenuOpen(false);
                      onToggleGuide?.(!card.guidePinned);
                    }}
                  >
                    {card.guidePinned ? "가이드 해제" : "가이드 고정"}
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="stream-post-menu-item is-danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                  >
                    삭제
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      <StreamMediaCarousel card={card} />
      {isArticleLink && <StreamLinkPreview card={card} variant="hero" mediaOnly />}

      <div className="stream-post-body">
        {displayTitle && <h2>{displayTitle}</h2>}
        {card.content.trim() && <p>{card.content}</p>}
        {!isYouTubeVideo && !isArticleLink && <StreamLinkPreview card={card} />}
        {card.fileUrl && (
          <div className="stream-file-list">
            <CardFileAttachment
              fileUrl={card.fileUrl}
              fileName={card.fileName ?? null}
              fileSize={card.fileSize ?? null}
              fileMimeType={card.fileMimeType ?? null}
            />
          </div>
        )}
        {fileAttachments.length > 0 && (
          <div className="stream-file-list">
            {fileAttachments.map((file) => (
              <CardFileAttachment
                key={file.id}
                fileUrl={file.url}
                fileName={file.fileName ?? null}
                fileSize={file.fileSize ?? null}
                fileMimeType={file.mimeType ?? null}
              />
            ))}
          </div>
        )}
      </div>

      <StreamEngagement cardId={card.id} boardId={boardId} />
    </article>
  );
}
