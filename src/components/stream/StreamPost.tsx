"use client";

import { useState } from "react";
import { formatRelativeTime } from "@/lib/card-engagement-format";
import { CardFileAttachment } from "../CardFileAttachment";
import type { CardData } from "../DraggableCard";
import { getStreamAuthor } from "./stream-author";
import { StreamEngagement } from "./StreamEngagement";
import { StreamLinkPreview } from "./StreamLinkPreview";
import { StreamMediaCarousel } from "./StreamMediaCarousel";

type Props = {
  card: CardData;
  canDelete: boolean;
  onDelete: () => void;
};

export function StreamPost({ card, canDelete, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const author = getStreamAuthor(card);
  const fileAttachments = (card.attachments ?? []).filter((item) => item.kind === "file");

  return (
    <article className="stream-post">
      <header className="stream-post-head">
        <div
          className="stream-avatar"
          style={{ backgroundColor: author.avatarColor }}
          aria-hidden="true"
        >
          {author.avatarText}
        </div>
        <div className="stream-author-copy">
          <strong>{author.displayName}</strong>
          <time>{formatRelativeTime(card.createdAt ?? new Date().toISOString())}</time>
        </div>
        {canDelete && (
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
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <StreamMediaCarousel card={card} />

      <div className="stream-post-body">
        {card.title.trim() && <h2>{card.title}</h2>}
        {card.content.trim() && <p>{card.content}</p>}
        <StreamLinkPreview card={card} />
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

      <StreamEngagement cardId={card.id} />
    </article>
  );
}
