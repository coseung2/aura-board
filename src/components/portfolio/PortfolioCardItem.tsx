"use client";

import { CardBody } from "../cards/CardBody";
import { ContextMenu, type MenuItem } from "../ContextMenu";
import type { PortfolioCardDTO } from "@/lib/portfolio-dto";
import { portfolioCardToCardData } from "./portfolio-card-adapter";
import { buildSourceLabel } from "./source-label";

type Props = {
  card: PortfolioCardDTO;
  canToggleShowcase: boolean;
  readOnly?: boolean;
  busy: boolean;
  onToggleShowcase: (card: PortfolioCardDTO) => void;
  onOpen: (card: PortfolioCardDTO) => void;
};

export function PortfolioCardItem({
  card,
  canToggleShowcase,
  busy,
  onToggleShowcase,
  onOpen,
}: Props) {
  const sourceLabel = buildSourceLabel({
    boardTitle: card.sourceBoard.title,
    boardLayout: card.sourceBoard.layout,
    sectionTitle: card.sourceSection?.title ?? null,
  });
  const cardData = portfolioCardToCardData(card);

  const menuItems: MenuItem[] = [];
  if (canToggleShowcase) {
    menuItems.push({
      label: card.isShowcasedByMe
        ? busy
          ? "처리 중..."
          : "자랑해요 내리기"
        : busy
          ? "처리 중..."
          : "자랑해요에 올리기",
      icon: "🌟",
      onClick: () => onToggleShowcase(card),
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(card);
    }
  }

  return (
    <article
      className={`padlet-card is-static is-clickable portfolio-card ${
        card.isShowcasedByMe ? "is-showcased-mine" : ""
      }`}
      style={{
        width: cardData.width,
        minHeight: cardData.height,
        backgroundColor: cardData.color ?? undefined,
      }}
      tabIndex={0}
      role="button"
      aria-label={`${card.title || "제목 없음"} - ${sourceLabel}, 자세히 보기`}
      onClick={() => onOpen(card)}
      onKeyDown={handleKeyDown}
    >
      {(card.isShowcasedByMe || card.hasAnyShowcase) && (
        <span
          className="portfolio-card-badge"
          aria-label="자랑해요 등록됨"
          role="img"
          title="자랑해요"
        >
          🌟
        </span>
      )}
      {menuItems.length > 0 && (
        <div
          className="card-ctx-menu portfolio-card-menu"
          onClick={(e) => e.stopPropagation()}
        >
          <ContextMenu items={menuItems} />
        </div>
      )}
      <CardBody card={cardData} boardId={card.sourceBoard.id} />
    </article>
  );
}
