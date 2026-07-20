import type { CardData } from "../DraggableCard";

export const DJ_PLAYED_DRAG_TYPE = "application/x-dj-played";

/** Keep every DJ surface consistent with the board-level anonymity setting. */
export function resolveDJQueueAuthorName(card: CardData): string {
  const resolved =
    card.externalAuthorName ?? card.studentAuthorName ?? card.authorName ?? "";
  return card.anonymousAuthor && resolved ? "익명" : resolved;
}

export function mergeDJQueueSnapshot(
  incoming: CardData[],
  local: CardData[],
  pendingIds: ReadonlySet<string>,
): CardData[] {
  const localById = new Map(local.map((card) => [card.id, card] as const));
  const next: CardData[] = [];

  for (const serverCard of incoming) {
    if (pendingIds.has(serverCard.id)) {
      const optimisticCard = localById.get(serverCard.id);
      if (optimisticCard) next.push(optimisticCard);
    } else {
      next.push(serverCard);
    }
  }

  for (const localCard of local) {
    if (
      pendingIds.has(localCard.id) &&
      !incoming.some((serverCard) => serverCard.id === localCard.id)
    ) {
      next.push(localCard);
    }
  }

  return next;
}

export function deriveDJQueueState(cards: CardData[], canControl: boolean) {
  const activeQueue = cards
    .filter(
      (card) =>
        card.queueStatus &&
        card.queueStatus !== "played" &&
        (canControl || card.queueStatus !== "rejected"),
    )
    .sort((a, b) => a.order - b.order);
  const playedCards = cards
    .filter((card) => card.queueStatus === "played")
    .sort((a, b) => b.order - a.order);
  const nowPlaying =
    activeQueue.find((card) => card.queueStatus === "approved") ?? null;
  const upNext = activeQueue.filter((card) => card.id !== nowPlaying?.id);

  return {
    activeQueue,
    playedCards,
    nowPlaying,
    upNext,
    pendingCount: activeQueue.filter((card) => card.queueStatus === "pending")
      .length,
    approvedCount: activeQueue.filter((card) => card.queueStatus === "approved")
      .length,
  };
}
