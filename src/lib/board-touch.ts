import { db } from "@/lib/db";

type BoardActivityDetails = {
  action?: string;
  actorType?: "teacher" | "student" | "guest" | "system";
  actorId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Keeps the lightweight board timestamp and the operational activity feed in
 * sync for card and section mutations that already call this helper.
 */
export async function touchBoardUpdatedAt(
  boardId: string,
  activity: BoardActivityDetails = {},
): Promise<void> {
  try {
    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.board.update({
        where: { id: boardId },
        data: { updatedAt: now },
      });
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
