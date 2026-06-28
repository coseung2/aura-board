"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { CardBody } from "../cards/CardBody";
import type { PortfolioCardDTO } from "@/lib/portfolio-dto";
import { portfolioCardToCardData } from "./portfolio-card-adapter";

type Props = {
  card: PortfolioCardDTO;
  className?: string;
  ariaLabel: string;
  onOpen: () => void;
  children?: ReactNode;
};

export function PortfolioCardSurface({
  card,
  className,
  ariaLabel,
  onOpen,
  children,
}: Props) {
  const cardData = portfolioCardToCardData(card);
  const classes = ["padlet-card", "is-static", "is-clickable", className]
    .filter(Boolean)
    .join(" ");

  function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  }

  return (
    <article
      className={classes}
      style={{
        width: cardData.width,
        minHeight: cardData.height,
        backgroundColor: cardData.color ?? undefined,
      }}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
    >
      {children}
      <CardBody card={cardData} boardId={card.sourceBoard.id} />
    </article>
  );
}
