import "server-only";

import { after } from "next/server";

import { announceCardChange } from "./realtime-broadcast";

type CardChangeType = "insert" | "update" | "delete";
type PendingCardChange = {
  changeType: CardChangeType;
  resolve: () => void;
};

const CARD_BROADCAST_BATCH_DELAY_MS = 500;
const pending = new Map<string, PendingCardChange[]>();
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function scheduleFlush(): void {
  if (timer || flushing) return;
  timer = setTimeout(() => {
    timer = null;
    void flushCardChanges();
  }, CARD_BROADCAST_BATCH_DELAY_MS);
  timer.unref?.();
}

function enqueueCardChange(
  boardId: string,
  changeType: CardChangeType,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const waiters = pending.get(boardId) ?? [];
    waiters.push({ changeType, resolve });
    pending.set(boardId, waiters);
    scheduleFlush();
  });
}

async function flushCardChanges(): Promise<void> {
  if (flushing || pending.size === 0) return;
  flushing = true;
  const batch = [...pending.entries()];
  pending.clear();
  try {
    for (let index = 0; index < batch.length; index += 6) {
      await Promise.all(
        batch.slice(index, index + 6).map(async ([boardId, waiters]) => {
          const latest = waiters.at(-1)?.changeType ?? "update";
          await announceCardChange(boardId, latest, waiters.length);
        }),
      );
    }
  } catch (error) {
    console.error("[realtime] batched card flush failed", {
      boards: batch.length,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    for (const [, waiters] of batch) {
      for (const waiter of waiters) waiter.resolve();
    }
    flushing = false;
    if (pending.size > 0) scheduleFlush();
  }
}

/** Send at most one board invalidation per short classroom mutation window. */
export function scheduleCardChangeBroadcast(
  boardId: string,
  changeType: CardChangeType = "insert",
): void {
  if (!boardId) return;
  after(() => enqueueCardChange(boardId, changeType));
}

export function clearCardBroadcastQueueForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  for (const waiters of pending.values()) {
    for (const waiter of waiters) waiter.resolve();
  }
  pending.clear();
  flushing = false;
}
