import type { BoardCard, BoardMeta } from "./types";

const ANONYMOUS_LABEL = "익명";

export function withBoardAnonymousAuthor(
  card: BoardCard,
  board: Pick<BoardMeta, "anonymousAuthor">,
): BoardCard {
  const anonymousAuthor = board.anonymousAuthor === true;
  return card.anonymousAuthor === anonymousAuthor
    ? card
    : { ...card, anonymousAuthor };
}

export function withBoardAnonymousAuthors(
  cards: BoardCard[],
  board: Pick<BoardMeta, "anonymousAuthor">,
): BoardCard[] {
  return cards.map((card) => withBoardAnonymousAuthor(card, board));
}

export function resolveCardAuthorName(card: BoardCard): string | null {
  const resolved = (() => {
    if (card.authors && card.authors.length > 0) {
      const visible = card.authors.slice(0, 3).map((author) => author.displayName);
      const suffix = card.authors.length > 3 ? ` 외 ${card.authors.length - 3}명` : "";
      return visible.join(", ") + suffix;
    }
    return card.externalAuthorName ?? card.studentAuthorName ?? card.authorName ?? null;
  })();
  return maskAnonymousLabel(resolved, card.anonymousAuthor);
}

export function maskAnonymousLabel(
  label: string | null | undefined,
  anonymousAuthor: boolean,
): string | null {
  if (!label) return null;
  return anonymousAuthor ? ANONYMOUS_LABEL : label;
}
