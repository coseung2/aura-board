"use client";

import type { ShowcaseEntryDTO } from "@/lib/portfolio-dto";
import { PortfolioCardSurface } from "./PortfolioCardSurface";

type Props = {
  entry: ShowcaseEntryDTO;
  onOpen: (entry: ShowcaseEntryDTO) => void;
};

export function ShowcaseCardChip({ entry, onOpen }: Props) {
  const card = entry.card;

  return (
    <PortfolioCardSurface
      card={card}
      className="showcase-chip"
      ariaLabel={`${card.title || "제목 없음"} - 자세히 보기`}
      onOpen={() => onOpen(entry)}
    >
      <span className="showcase-chip-badge" aria-hidden title="자랑해요">
        🌟
      </span>
    </PortfolioCardSurface>
  );
}
