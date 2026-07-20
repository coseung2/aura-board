import type { BoardCard } from "../../lib/types";

/** Keep the general card feed order stable across writable and read-only views. */
export function sortCards(cards: readonly BoardCard[]): BoardCard[] {
  return [...cards].sort((left, right) => {
    const leftOrder = left.order ?? 0;
    const rightOrder = right.order ?? 0;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return (
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    );
  });
}

export function updateCardCommentCount(
  cards: readonly BoardCard[],
  cardId: string,
  change: number,
): BoardCard[] {
  return cards.map((card) =>
    card.id === cardId
      ? {
          ...card,
          commentCount: Math.max(0, (card.commentCount ?? 0) + change),
        }
      : card,
  );
}

export function nextCardOrder(
  cards: readonly BoardCard[],
  sectionId?: string | null,
): number {
  return (
    cards.reduce((highest, card) => {
      if (sectionId && card.sectionId !== sectionId) return highest;
      return Math.max(highest, card.order ?? 0);
    }, -1) + 1
  );
}
