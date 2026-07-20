import type { BoardCard } from "../../lib/types";

export type QueueStatus = "pending" | "approved" | "rejected" | "played";

export type QueueRankingItem = { name: string; count: number };

/**
 * Merge a server queue snapshot without letting an in-flight optimistic
 * mutation disappear before its response has settled.
 */
export function mergeQueueSnapshot(
  incoming: BoardCard[],
  local: BoardCard[],
  pendingIds: ReadonlySet<string>,
): BoardCard[] {
  const localById = new Map(local.map((card) => [card.id, card] as const));
  const next: BoardCard[] = [];

  for (const serverCard of incoming) {
    if (pendingIds.has(serverCard.id)) {
      const optimisticCard = localById.get(serverCard.id);
      if (optimisticCard) next.push(optimisticCard);
    } else {
      next.push(serverCard);
    }
  }

  // A pending delete/status mutation may temporarily remove a card from the
  // snapshot. Keep its optimistic shape until the request settles.
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

export function resolveQueueAuthorName(card: BoardCard): string {
  const resolved =
    card.externalAuthorName ?? card.studentAuthorName ?? card.authorName ?? "";
  return card.anonymousAuthor && resolved ? "익명" : resolved;
}

export function deriveQueueState(
  cards: BoardCard[],
  canControl: boolean,
  rankingLimit: number,
  hideSubmitterRanking = false,
) {
  const activeQueue = [...cards]
    .filter((card) => {
      if (!card.queueStatus || card.queueStatus === "played") return false;
      if (card.queueStatus === "rejected" && !canControl) return false;
      return true;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const playedCards = [...cards]
    .filter((card) => card.queueStatus === "played")
    .sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  const nowPlaying =
    activeQueue.find((card) => card.queueStatus === "approved") ?? null;
  const upNext = activeQueue.filter((card) => card.id !== nowPlaying?.id);
  const rankingCounts = new Map<string, number>();

  if (!hideSubmitterRanking) {
    for (const card of cards) {
      const name = resolveQueueAuthorName(card);
      if (name) rankingCounts.set(name, (rankingCounts.get(name) ?? 0) + 1);
    }
  }

  const ranking: QueueRankingItem[] = [...rankingCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, rankingLimit);

  return {
    activeQueue,
    playedCards,
    nowPlaying,
    upNext,
    pendingCount: activeQueue.filter((card) => card.queueStatus === "pending")
      .length,
    approvedCount: activeQueue.filter((card) => card.queueStatus === "approved")
      .length,
    ranking,
  };
}
