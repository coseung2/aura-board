import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  READING_REWARD_REVERSAL_SOURCE_TYPE,
  ReadingRewardReversalError,
  reverseReadingReward,
} from "@/lib/avatar-rewards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

class ReadingLogDeletionError extends Error {
  constructor(
    public readonly code: "not_found",
    public readonly status = 404,
  ) {
    super(code);
    this.name = "ReadingLogDeletionError";
  }
}

function isMissingReadingLogTable(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    if ((error as { code?: unknown }).code === "P2021") return true;
  }
  return (
    error instanceof Error &&
    (error.message.includes("ReadingLog") || error.message.includes("readingLog"))
  );
}

function errorResponse(error: unknown) {
  if (error instanceof ReadingLogDeletionError || error instanceof ReadingRewardReversalError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  if (isMissingReadingLogTable(error)) {
    return NextResponse.json({ error: "reading_log_not_ready" }, { status: 503 });
  }
  console.error("[DELETE /api/classrooms/:id/reading/:logId]", error);
  return NextResponse.json({ error: "internal" }, { status: 500 });
}

/**
 * DELETE /api/classrooms/:id/reading/:logId
 *
 * Only the owning teacher may remove a student's reading log. The log delete,
 * source-specific reward withdrawal, and reward inventory cleanup share one
 * transaction so a failed withdrawal (for example, after the student spent
 * the reward) leaves the original log intact.
 */
export async function DELETE(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; logId?: string; readingLogId?: string }>;
  },
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: classroomId, logId: routeLogId, readingLogId } = await params;
  const logId = routeLogId ?? readingLogId;
  if (!logId) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { id: true, teacherId: true },
  });
  if (!classroom) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (classroom.teacherId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const log = await tx.readingLog.findUnique({
        where: { id: logId },
        select: {
          id: true,
          classroomId: true,
          studentId: true,
          student: { select: { classroomId: true } },
        },
      });

      if (
        !log ||
        log.classroomId !== classroomId ||
        log.student.classroomId !== classroomId
      ) {
        // A source-specific reversal proves that an earlier request already
        // completed. Other missing IDs remain a normal 404 and disclose no
        // cross-classroom record existence.
        const reversal = await tx.transaction.findFirst({
          where: {
            sourceType: READING_REWARD_REVERSAL_SOURCE_TYPE,
            sourceRef: logId,
            type: "withdraw",
            account: { classroomId },
          },
          select: { amount: true, balanceAfter: true },
        });
        if (reversal) {
          return {
            deleted: false,
            idempotent: true,
            rewardReversed: reversal.amount,
            balance: reversal.balanceAfter,
            legacyRewardCandidates: 0,
            deletedRewardInventory: 0,
          };
        }
        throw new ReadingLogDeletionError("not_found");
      }

      // Delete first inside the transaction. Only one concurrent request can
      // observe/delete this row; a loser sees the committed reversal marker.
      const deleted = await tx.readingLog.deleteMany({
        where: { id: log.id, classroomId },
      });
      if (deleted.count === 0) {
        const reversal = await tx.transaction.findFirst({
          where: {
            sourceType: READING_REWARD_REVERSAL_SOURCE_TYPE,
            sourceRef: logId,
            type: "withdraw",
            account: { classroomId },
          },
          select: { amount: true, balanceAfter: true },
        });
        if (reversal) {
          return {
            deleted: false,
            idempotent: true,
            rewardReversed: reversal.amount,
            balance: reversal.balanceAfter,
            legacyRewardCandidates: 0,
            deletedRewardInventory: 0,
          };
        }
        throw new ReadingLogDeletionError("not_found");
      }

      const reward = await reverseReadingReward(tx, {
        studentId: log.studentId,
        readingLogId: log.id,
        performerId: user.id,
      });
      // Reading rewards may also have granted a cosmetic inventory item in a
      // later rollout. Only `acquiredVia=reward` rows linked to this source are
      // removed; purchases and manual grants remain untouched.
      const deletedRewardInventory = await tx.avatarInventoryItem.deleteMany({
        where: {
          studentId: log.studentId,
          acquiredVia: "reward",
          sourceRef: log.id,
        },
      });

      return {
        deleted: true,
        idempotent: false,
        rewardReversed: reward.amount,
        balance: reward.balance,
        legacyRewardCandidates: reward.legacyRewardCandidates,
        deletedRewardInventory: deletedRewardInventory.count,
      };
    });

    await logAudit({
      actorType: "teacher",
      actorId: user.id,
      action: "reading_log.delete",
      resourceType: "reading_log",
      resourceId: logId,
      metadata: {
        classroomId,
        idempotent: result.idempotent,
        rewardReversed: result.rewardReversed,
        legacyRewardCandidates: result.legacyRewardCandidates,
        legacyRewardsPreserved: result.legacyRewardCandidates > 0,
        deletedRewardInventory: result.deletedRewardInventory,
      },
      req,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      // Keep this explicit for clients and audit consumers: source-less legacy
      // rewards were intentionally preserved because their owning log cannot
      // be proven safely.
      legacyRewardsPreserved: result.legacyRewardCandidates > 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
