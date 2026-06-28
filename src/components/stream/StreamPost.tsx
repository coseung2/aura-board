"use client";

import { useState } from "react";
import { formatRelativeTime } from "@/lib/card-engagement-format";
import { CardBody } from "../cards/CardBody";
import { CardEngagement } from "../engagement/CardEngagement";
import type { CardData } from "../DraggableCard";
import { getStreamAuthor } from "./stream-author";

type Props = {
  card: CardData;
  canEdit: boolean;
  onEdit: () => void;
  canDelete: boolean;
  onDelete: () => void;
  onOpen?: () => void;
  canToggleGuide?: boolean;
  guideBusy?: boolean;
  onToggleGuide?: (pinned: boolean) => void;
  boardId?: string;
  isStudentViewer?: boolean;
};

export function StreamPost({
  card,
  canEdit,
  onEdit,
  canDelete,
  onDelete,
  onOpen,
  canToggleGuide = false,
  guideBusy = false,
  onToggleGuide,
  boardId,
  isStudentViewer = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const author = getStreamAuthor(card);

  return (
    <article
      className={`stream-post${card.guidePinned ? " is-guide" : ""}${
        onOpen ? " is-clickable" : ""
      }`}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!onOpen) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
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
          <div
            className="stream-post-menu"
            onClick={(event) => event.stopPropagation()}
          >
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

      <div className="stream-post-body">
        <CardBody
          card={card}
          titleAs="h2"
          showAuthorFooter={false}
          showEngagement={false}
          contentDisplay="full"
          boardId={boardId}
        />
      </div>

      <div className="stream-post-engagement" onClick={(event) => event.stopPropagation()}>
        <CardEngagement
          cardId={card.id}
          mode="chips"
          boardId={boardId}
          isStudentViewer={isStudentViewer}
          initialCounts={{
            likeCount: card.likeCount ?? 0,
            commentCount: card.commentCount ?? 0,
          }}
        />
      </div>
    </article>
  );
}
