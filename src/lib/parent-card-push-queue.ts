import "server-only";

import { after } from "next/server";

import {
  dispatchLinkedParentCardPushBatch,
  type ChildCardPushInput,
} from "./parent-push";

const PARENT_CARD_PUSH_BATCH_DELAY_MS = 750;
const pending: Array<{
  input: ChildCardPushInput;
  resolve: () => void;
}> = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function scheduleFlush(): void {
  if (timer || flushing) return;
  timer = setTimeout(() => {
    timer = null;
    void flushPushes();
  }, PARENT_CARD_PUSH_BATCH_DELAY_MS);
  timer.unref?.();
}

function enqueuePush(input: ChildCardPushInput): Promise<void> {
  return new Promise<void>((resolve) => {
    pending.push({ input, resolve });
    scheduleFlush();
  });
}

async function flushPushes(): Promise<void> {
  if (flushing || pending.length === 0) return;
  flushing = true;
  const batch = pending.splice(0, pending.length);
  try {
    await dispatchLinkedParentCardPushBatch(batch.map((item) => item.input));
  } catch (error) {
    console.error("[parent-push] queued card batch failed", {
      count: batch.length,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    for (const item of batch) item.resolve();
    flushing = false;
    if (pending.length > 0) scheduleFlush();
  }
}

/** Batch child-card parent link resolution after the card response is sent. */
export function scheduleLinkedParentCardPush(input: ChildCardPushInput): void {
  after(() => enqueuePush(input));
}

export function parentCardPushQueueStateForTests() {
  return {
    queued: pending.length,
    flushing,
    batchDelayMs: PARENT_CARD_PUSH_BATCH_DELAY_MS,
  };
}

export function clearParentCardPushQueueForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  for (const item of pending.splice(0, pending.length)) item.resolve();
  flushing = false;
}
