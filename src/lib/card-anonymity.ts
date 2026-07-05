import type { CardData } from "@/components/DraggableCard";

export function withBoardAnonymousAuthors<T extends CardData>(
  cards: T[],
  anonymousAuthor: boolean,
): T[] {
  return cards.map((card) =>
    card.anonymousAuthor === anonymousAuthor
      ? card
      : { ...card, anonymousAuthor },
  );
}

export function withBoardAnonymousAuthor<T extends CardData | null>(
  card: T,
  anonymousAuthor: boolean,
): T {
  if (!card || card.anonymousAuthor === anonymousAuthor) return card;
  return { ...card, anonymousAuthor };
}
