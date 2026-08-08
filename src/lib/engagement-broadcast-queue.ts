import "server-only";

import { after } from "next/server";

import { db } from "./db";
import { announceEngagementBatchChange } from "./realtime-broadcast";

type EngagementChangeType = "like" | "comment";

type PendingEngagement = {
  boardId: string;
  cardId: string;
  changeType: EngagementChangeType;
  resolve: () => void;
};

const ENGAGEMENT_BATCH_DELAY_MS = 500;
const pending = new Map<string, PendingEngagement[]>();
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function scheduleFlush(): void {
  if (timer || flushing) return;
  timer = setTimeout(() => {
    timer = null;
    void flushEngagement();
  }, ENGAGEMENT_BATCH_DELAY_MS);
  timer.unref?.();
}

function enqueueEngagement(
  boardId: string,
  cardId: string,
  changeType: EngagementChangeType,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const key = `${boardId}:${cardId}`;
    const waiters = pending.get(key) ?? [];
    waiters.push({ boardId, cardId, changeType, resolve });
    pending.set(key, waiters);
    scheduleFlush();
  });
}

async function runWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        await worker(values[index]!);
      }
    }),
  );
}

async function flushEngagement(): Promise<void> {
  if (flushing || pending.size === 0) return;
  flushing = true;
  const batch = [...pending.values()];
  pending.clear();
  const allWaiters = batch.flat();
  try {
    const cardIds = [...new Set(allWaiters.map((item) => item.cardId))];
    const cards = await db.card.findMany({
      where: { id: { in: cardIds } },
      select: {
        id: true,
        boardId: true,
        _count: {
          select: {
            likes: true,
            comments: { where: { audience: "public", deletedAt: null } },
          },
        },
      },
    });
    const latestTypeByCard = new Map(
      batch.map((items) => [items.at(-1)!.cardId, items.at(-1)!.changeType]),
    );
    const changeCountByCard = new Map(
      batch.map((items) => [items.at(-1)!.cardId, items.length]),
    );
    const changesByBoard = new Map<
      string,
      Array<{
        cardId: string;
        likeCount: number;
        commentCount: number;
        changeType: EngagementChangeType;
        changeCount: number;
      }>
    >();
    for (const card of cards) {
      const changes = changesByBoard.get(card.boardId) ?? [];
      changes.push({
        cardId: card.id,
        likeCount: card._count.likes,
        commentCount: card._count.comments,
        changeType: latestTypeByCard.get(card.id) ?? "comment",
        changeCount: changeCountByCard.get(card.id) ?? 1,
      });
      changesByBoard.set(card.boardId, changes);
    }
    await runWithConcurrency(
      [...changesByBoard.entries()],
      6,
      async ([boardId, changes]) => {
        await announceEngagementBatchChange(boardId, changes);
      },
    );
  } catch (error) {
    console.error("[realtime] batched engagement flush failed", {
      count: allWaiters.length,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    for (const item of allWaiters) item.resolve();
    flushing = false;
    if (pending.size > 0) scheduleFlush();
  }
}

/** Aggregate count queries and broadcasts for a synchronized class wave. */
export function scheduleEngagementBroadcast(
  boardId: string,
  cardId: string,
  changeType: EngagementChangeType,
): void {
  if (!boardId || !cardId) return;
  after(() => enqueueEngagement(boardId, cardId, changeType));
}

export function engagementBroadcastQueueStateForTests() {
  return {
    queuedCards: pending.size,
    flushing,
    batchDelayMs: ENGAGEMENT_BATCH_DELAY_MS,
  };
}

export function clearEngagementBroadcastQueueForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  for (const items of pending.values()) {
    for (const item of items) item.resolve();
  }
  pending.clear();
  flushing = false;
}
