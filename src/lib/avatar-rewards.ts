// Reading reward hook for the avatar customization MVP (2026-07-02).
//
// When a student posts a ReadingLog with aiScore >= the classroom
// `readingMinScoreForPayout` config, we credit the existing wallet with
// ``score * readingRewardPerPoint`` won, written as a normal Transaction
// with type ``"deposit"`` and performerKind ``"system"`` (matches the
// existing convention for system-credited balances).
//
// This module is intentionally narrow. It is called from
// /api/student/reading POST *after* the ReadingLog is created, so a
// failure to credit does not roll back the log entry.
import "server-only";
import { db } from "./db";
import { ensureAccountFor } from "./bank";
import type { Prisma } from "@prisma/client";

export type ReadingRewardResult = {
  amount: number;
  unitLabel: string;
} | null;

export type AwardReadingRewardInput = {
  student: { id: string; classroomId: string };
  score: number | null;
  readingLogId: string;
};

// Default per-classroom config matches the schema defaults.
const DEFAULT_REWARD_PER_POINT = 10;
const DEFAULT_MIN_SCORE = 5;

export async function awardReadingReward(
  input: AwardReadingRewardInput,
): Promise<ReadingRewardResult> {
  const score = input.score;
  if (typeof score !== "number" || score <= 0) return null;

  const config = await db.avatarRewardConfig.findUnique({
    where: { classroomId: input.student.classroomId },
  });
  const rewardPerPoint = config?.readingRewardPerPoint ?? DEFAULT_REWARD_PER_POINT;
  const minScore = config?.readingMinScoreForPayout ?? DEFAULT_MIN_SCORE;
  if (score < minScore) return null;

  const amount = score * rewardPerPoint;
  if (amount <= 0) return null;

  const { accountId } = await ensureAccountFor(input.student);
  const currency = await db.classroomCurrency.findUnique({
    where: { classroomId: input.student.classroomId },
    select: { unitLabel: true },
  });
  const unitLabel = currency?.unitLabel ?? "\uC6D0";

  await db.$transaction(async (tx) => {
    const updated = await tx.studentAccount.update({
      where: { id: accountId },
      data: { balance: { increment: amount } },
      select: { balance: true },
    });
    await tx.transaction.create({
      data: {
        accountId,
        type: "deposit",
        amount,
        balanceAfter: updated.balance,
        note: "\uC544\uBC14\uD0C0 \uB3C5\uC11C \uB178\uB834 (\uC810\uC218: " + score + ")",
        performedById: input.student.id,
        performedByKind: "owner",
        // Reuse the reading log id as a free-form reference inside ``note``;
        // we do not have a dedicated FK on Transaction.
      } satisfies Prisma.TransactionUncheckedCreateInput,
    });
  });

  return { amount, unitLabel };
}
