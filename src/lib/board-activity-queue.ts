import "server-only";

import { Prisma } from "@prisma/client";
import { after } from "next/server";

import { db } from "./db";
import { invalidateBoardSnapshotCache } from "./board-snapshot-cache";

type BoardActivityDetails = {
  action?: string;
  actorType?: "teacher" | "student" | "guest" | "system";
  actorId?: string | null;
  metadata?: Record<string, unknown>;
  coalesceMs?: number;
};

type PendingActivity = {
  boardId: string;
  activity: BoardActivityDetails;
  createdAt: Date;
  resolve: () => void;
};

const BOARD_ACTIVITY_BATCH_DELAY_MS = 500;
const pending: PendingActivity[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function scheduleFlush(): void {
  if (timer || flushing) return;
  timer = setTimeout(() => {
    timer = null;
    void flushActivities();
  }, BOARD_ACTIVITY_BATCH_DELAY_MS);
  timer.unref?.();
}

function enqueueActivity(
  boardId: string,
  activity: BoardActivityDetails,
): Promise<void> {
  return new Promise<void>((resolve) => {
    pending.push({ boardId, activity, createdAt: new Date(), resolve });
    scheduleFlush();
  });
}

async function keepExistingActivities(
  activities: readonly PendingActivity[],
): Promise<PendingActivity[]> {
  const boardIds = [...new Set(activities.map((item) => item.boardId))];
  if (boardIds.length === 0) return [];
  const existingBoards = await db.board.findMany({
    where: { id: { in: boardIds } },
    select: { id: true },
  });
  const existingIds = new Set(existingBoards.map((board) => board.id));
  return activities.filter((item) => existingIds.has(item.boardId));
}

async function persistActivities(
  activities: readonly PendingActivity[],
): Promise<void> {
  if (activities.length === 0) return;
  const now = new Date();
  const immediateBoardIds = new Set<string>();
  const coalescedBoardIds = new Set<string>();
  let smallestCoalesceMs = Number.POSITIVE_INFINITY;
  for (const item of activities) {
    const coalesceMs = Math.max(
      0,
      Math.floor(item.activity.coalesceMs ?? 0),
    );
    if (coalesceMs === 0) immediateBoardIds.add(item.boardId);
    else {
      coalescedBoardIds.add(item.boardId);
      smallestCoalesceMs = Math.min(smallestCoalesceMs, coalesceMs);
    }
  }
  for (const boardId of immediateBoardIds) {
    coalescedBoardIds.delete(boardId);
  }

  const operations: Prisma.PrismaPromise<unknown>[] = [
    db.boardActivityEvent.createMany({
      data: activities.map((item) => ({
        boardId: item.boardId,
        action: item.activity.action ?? "board.updated",
        actorType: item.activity.actorType ?? "system",
        actorId: item.activity.actorId ?? null,
        metadata:
          item.activity.metadata === undefined
            ? Prisma.DbNull
            : (item.activity.metadata as Prisma.InputJsonValue),
        createdAt: item.createdAt,
      })),
    }),
  ];
  if (immediateBoardIds.size > 0) {
    operations.push(
      db.board.updateMany({
        where: { id: { in: [...immediateBoardIds] } },
        data: { updatedAt: now },
      }),
    );
  }
  if (coalescedBoardIds.size > 0) {
    operations.push(
      db.board.updateMany({
        where: {
          id: { in: [...coalescedBoardIds] },
          updatedAt: {
            lt: new Date(now.getTime() - smallestCoalesceMs),
          },
        },
        data: { updatedAt: now },
      }),
    );
  }
  await db.$transaction(operations);
}

function isBoardActivityForeignKeyConflict(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    String((error as { code?: unknown }).code) === "P2003"
  );
}

async function flushActivities(): Promise<void> {
  if (flushing || pending.length === 0) return;
  flushing = true;
  const batch = pending.splice(0, pending.length);
  try {
    let valid = await keepExistingActivities(batch);
    try {
      await persistActivities(valid);
    } catch (error) {
      if (!isBoardActivityForeignKeyConflict(error)) throw error;
      // A board may be deleted after the first existence read but before the
      // insert transaction. The failed transaction is atomic, so refresh once
      // and persist the remaining boards without duplicating any event.
      valid = await keepExistingActivities(valid);
      await persistActivities(valid);
    }
  } catch (error) {
    console.error("[board-activity] batched activity flush failed", {
      count: batch.length,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    for (const item of batch) item.resolve();
    flushing = false;
    if (pending.length > 0) scheduleFlush();
  }
}

/**
 * Register durable board activity after the mutation response. High-frequency
 * classroom actions share one existence check, one event insert, and at most
 * two Board timestamp updates per batch while preserving every event row.
 */
export function scheduleBoardActivity(
  boardId: string,
  activity: BoardActivityDetails = {},
): void {
  if (!boardId) return;
  invalidateBoardSnapshotCache(boardId);
  after(() => enqueueActivity(boardId, activity));
}

export function boardActivityQueueStateForTests() {
  return {
    queued: pending.length,
    flushing,
    batchDelayMs: BOARD_ACTIVITY_BATCH_DELAY_MS,
  };
}

export function clearBoardActivityQueueForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  for (const item of pending.splice(0, pending.length)) item.resolve();
  flushing = false;
}
