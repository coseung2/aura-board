import { portfolioCardToBoardCard } from "./portfolio-card";
import type { ParentPostDTO, PortfolioCardDTO, BoardCard } from "./types";

export type ParentFeedCardDTO = ParentPostDTO | PortfolioCardDTO;

/** Adapt only the parent-scoped payload; the rendered post remains shared. */
export function toParentFeedBoardCard(
  card: ParentFeedCardDTO,
  childName?: string,
): BoardCard {
  const linkedChildNames =
    "linkedChildren" in card
      ? card.linkedChildren.map((child) => child.name).filter(Boolean).join(" · ")
      : "";
  const attribution = linkedChildNames || childName || "우리 아이";
  return portfolioCardToBoardCard(card, {
    fallbackAuthor: { id: null, name: attribution },
  });
}

export function parentFeedAttribution(
  card: ParentFeedCardDTO,
  childName?: string,
): string {
  if ("linkedChildren" in card) {
    const linked = card.linkedChildren.map((child) => child.name).filter(Boolean).join(" · ");
    if (linked) return linked;
  }
  return childName || "우리 아이";
}

export function parentFeedSourceLabel(card: ParentFeedCardDTO): string {
  if (card.sourceBoard.layout === "columns" && card.sourceSection) {
    return `${card.sourceBoard.title} · ${card.sourceSection.title}`;
  }
  return card.sourceBoard.title;
}
