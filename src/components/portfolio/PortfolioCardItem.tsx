"use client";

import type { PortfolioCardDTO } from "@/lib/portfolio-dto";
import { PortfolioCardSurface } from "./PortfolioCardSurface";
import { buildSourceLabel } from "./source-label";

type Props = {
  card: PortfolioCardDTO;
  onOpen: (card: PortfolioCardDTO) => void;
};

export function PortfolioCardItem({
  card,
  onOpen,
}: Props) {
  const sourceLabel = buildSourceLabel({
    boardTitle: card.sourceBoard.title,
    boardLayout: card.sourceBoard.layout,
    sectionTitle: card.sourceSection?.title ?? null,
  });

  return (
    <PortfolioCardSurface
      card={card}
      className="portfolio-card"
      ariaLabel={`${card.title || "제목 없음"} - ${sourceLabel}, 자세히 보기`}
      onOpen={() => onOpen(card)}
    >
    </PortfolioCardSurface>
  );
}
