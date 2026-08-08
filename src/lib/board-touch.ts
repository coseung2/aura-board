import { db } from "@/lib/db";
import { invalidateBoardSnapshotCache } from "@/lib/board-snapshot-cache";

type BoardActivityDetails = {
  action?: string;
  actorType?: "teacher" | "student" | "guest" | "system";
  actorId?: string | null;
  metadata?: Record<string, unknown>;
  /** Coalesce the mutable Board row while preserving every activity event. */
  coalesceMs?: number;
};

/**
 * Keeps the lightweight board timestamp and the operational activity feed in
 * sync for card and section mutations that already call this helper.
 */
export async function touchBoardUpdatedAt(
  boardId: string,
  activity: BoardActivityDetails = {},
): Promise<void> {
  invalidateBoardSnapshotCache(boardId);
  try {
    const now = new Date();
    const coalesceMs = Math.max(0, Math.floor(activity.coalesceMs ?? 0));
    await db.$transaction(async (tx) => {
      // Append first so the shared Board row is locked for the shortest
      // possible tail of the transaction. Every action remains observable.
      await tx.boardActivityEvent.create({
        data: {
          boardId,
          action: activity.action ?? "board.updated",
          actorType: activity.actorType ?? "system",
          actorId: activity.actorId ?? null,
          metadata: (activity.metadata as never) ?? null,
          createdAt: now,
        },
      });
      if (coalesceMs > 0) {
        await tx.board.updateMany({
          where: {
            id: boardId,
            updatedAt: { lt: new Date(now.getTime() - coalesceMs) },
          },
          data: { updatedAt: now },
        });
      } else {
        await tx.board.update({
          where: { id: boardId },
          data: { updatedAt: now },
        });
      }
    });
  } catch (error) {
    // The original mutation has already committed. Do not misreport it as a
    // failed classroom action, but leave evidence for server observability.
    console.error("[board-activity] failed to record board activity", {
      boardId,
      action: activity.action ?? "board.updated",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
