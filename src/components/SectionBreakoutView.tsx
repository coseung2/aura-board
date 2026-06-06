"use client";

import Link from "next/link";
import { useState } from "react";
import { CardBody } from "./cards/CardBody";
import { CardDetailModal } from "./cards/CardDetailModal";
import type { CardData } from "./DraggableCard";

type CardLike = {
  id: string;
  title: string;
  content: string;
  color: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  linkTitle: string | null;
  linkDesc: string | null;
  linkImage: string | null;
  videoUrl: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileMimeType?: string | null;
  attachments?: Array<{
    id: string;
    kind: string;
    url: string;
    previewUrl?: string | null;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    order: number;
  }>;
  externalAuthorName?: string | null;
  studentAuthorName?: string | null;
  authorName?: string | null;
  createdAt?: string | null;
};

type Props = {
  boardId: string;
  boardTitle: string;
  sectionTitle: string;
  cards: CardLike[];
  shareManagementHref?: string | null; // owner only
  autoJoinWarning?: string | null; // BR-5 link-fixed feedback
};

/**
 * Server component — no client state.
 * Renders ONLY the cards passed in (caller is responsible for scoping).
 */
export function SectionBreakoutView({
  boardId,
  boardTitle,
  sectionTitle,
  cards,
  shareManagementHref,
  autoJoinWarning,
}: Props) {
  const [openCard, setOpenCard] = useState<CardLike | null>(null);
  return (
    <main className="board-page">
      <header className="board-header">
        <div className="board-header-left">
          <Link href={`/board/${boardId}`} className="board-back-link" aria-label="보드 전체 보기로">
            ←
          </Link>
          <h1 className="board-title">{sectionTitle}</h1>
          <span className="board-layout-badge">Breakout</span>
        </div>
        <div className="board-header-right">
          {shareManagementHref ? (
            <Link href={shareManagementHref} className="column-add-btn">
              공유 관리
            </Link>
          ) : null}
        </div>
      </header>

      <div className="breakout-header">
        <span className="breakout-breadcrumb">{boardTitle} › {sectionTitle}</span>
      </div>
      {autoJoinWarning && (
        <div
          role="alert"
          style={{
            margin: "8px 16px",
            padding: 12,
            background: "var(--color-warn-bg,#fff8e1)",
            color: "var(--color-warn,#8a6d00)",
            border: "1px solid var(--color-warn-border,#ffe08a)",
            borderRadius: 6,
          }}
        >
          {autoJoinWarning}
        </div>
      )}

      {cards.length === 0 ? (
        <p className="breakout-empty">이 섹션에는 아직 카드가 없어요.</p>
      ) : (
        <div className="breakout-grid" role="list">
          {cards.map((c) => (
            <article
              key={c.id}
              role="listitem button"
              className="column-card is-clickable"
              style={{ backgroundColor: c.color ?? undefined }}
              tabIndex={0}
              onClick={() => setOpenCard(c)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpenCard(c);
                }
              }}
            >
              <CardBody card={c} titleAs="h4" />
            </article>
          ))}
        </div>
      )}

      <CardDetailModal
        card={openCard ? (openCard as unknown as CardData) : null}
        onClose={() => setOpenCard(null)}
        cards={cards as unknown as CardData[]}
        onChange={(c) => setOpenCard(c as unknown as CardLike)}
      />
    </main>
  );
}
