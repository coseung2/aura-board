"use client";

import { CardBody } from "../cards/CardBody";
import type { ShowcaseEntryDTO } from "@/lib/portfolio-dto";
import { portfolioCardToCardData } from "./portfolio-card-adapter";

type Props = {
  entry: ShowcaseEntryDTO;
  onOpen: (entry: ShowcaseEntryDTO) => void;
};

export function ShowcaseCardChip({ entry, onOpen }: Props) {
  const card = entry.card;
  const cardData = portfolioCardToCardData(card);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(entry);
    }
  }

  return (
    <article
      className="padlet-card is-static is-clickable showcase-chip"
      style={{
        width: cardData.width,
        minHeight: cardData.height,
        backgroundColor: cardData.color ?? undefined,
      }}
      tabIndex={0}
      role="button"
      aria-label={`${card.title || "제목 없음"} - 자세히 보기`}
      onClick={() => onOpen(entry)}
      onKeyDown={onKey}
    >
      <span className="showcase-chip-badge" aria-hidden title="자랑해요">
        🌟
      </span>
      <CardBody card={cardData} boardId={card.sourceBoard.id} />
    </article>
  );
}
