"use client";

import { CardBody } from "../cards/CardBody";
import { ContextMenu, type MenuItem } from "../ContextMenu";
import type { PortfolioCardDTO } from "@/lib/portfolio-dto";
import { buildSourceLabel } from "./source-label";

type Props = {
  card: PortfolioCardDTO;
  /** 본인이 작성/공동작성한 카드면 true — 자랑해요 토글 메뉴 노출 */
  canToggleShowcase: boolean;
  busy: boolean;
  onToggleShowcase: (card: PortfolioCardDTO) => void;
  /** 카드 클릭 시 부모(StudentView) 가 모달 오픈. */
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
  const deepLink = `/board/${card.sourceBoard.slug}`;

  const menuItems: MenuItem[] = [];
  if (canToggleShowcase) {
    menuItems.push({
      label: card.isShowcasedByMe
        ? busy
          ? "처리 중…"
          : "🌟 자랑해요 내리기"
        : busy
          ? "처리 중…"
          : "🌟 자랑해요에 올리기",
      icon: "🌟",
      onClick: () => onToggleShowcase(card),
    });
  }
  menuItems.push({
    label: "원본 보드로 이동",
    icon: "↗️",
    onClick: () => {
      window.location.href = deepLink;
    },
  });

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(card);
    }
  }

  return (
    <article
      className={`portfolio-card ${card.isShowcasedByMe ? "is-showcased-mine" : ""}`}
      style={{ backgroundColor: card.color ?? undefined }}
      tabIndex={0}
      role="button"
      aria-label={`${card.title} — ${sourceLabel}, 클릭하여 자세히 보기`}
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
      <div className="portfolio-card-link">
        <CardBody card={card} titleAs="h4" />
      </div>
      <div className="portfolio-card-foot">
        <span className="portfolio-card-source" title={sourceLabel}>
          {sourceLabel}
        </span>
        {menuItems.length > 0 && (
          <div
            className="portfolio-card-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <ContextMenu items={menuItems} />
          </div>
        )}
      </div>
    </article>
  );
}
