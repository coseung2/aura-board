// Reading reward hook for the avatar customization MVP (2026-07-02).
//
// When a student posts a ReadingLog with aiScore >= the classroom
// `readingMinScoreForPayout` config, we credit the existing wallet with
// `score * readingRewardPerPoint` won, written as a normal Transaction
// with type `deposit` and performerKind `owner` (the existing convention for
// student-owned wallet actions).
//
// This module is intentionally narrow. It is called from
// /api/student/reading POST *after* the ReadingLog is created, so a
// failure to credit does not roll back the log entry.
import "server-only";
import { db } from "./db";
import { ensureAccountFor } from "./bank";
import { Prisma } from "@prisma/client";
import { getStudentPetEffects } from "./pets/service";
import { isFeatureEnabled } from "./feature-flags";

export type ReadingRewardResult = {
  amount: number;
  unitLabel: string;
} | null;

export type AwardReadingRewardInput = {
  student: { id: string; classroomId: string };
  score: number | null;
  readingLogId: string;
};

/** Stable source keys used to make reward mutations idempotent. */
export const READING_REWARD_SOURCE_TYPE = "reading_reward";
export const READING_REWARD_REVERSAL_SOURCE_TYPE = "reading_reward_reversal";

// Rewards created before source linkage was introduced only have a free-form
// note. They are deliberately reported but never guessed or withdrawn: there
// is no safe way to map one of those deposits back to a particular log.
export const LEGACY_READING_REWARD_NOTE_PREFIX = "\uC544\uBC14\uD0C0 \uB3C5\uC11C";

export class ReadingRewardReversalError extends Error {
  constructor(
    public readonly code: "insufficient_balance",
    public readonly status = 409,
  ) {
    super(code);
    this.name = "ReadingRewardReversalError";
  }
}

export type ReadingRewardReversalResult = {
  amount: number;
  balance: number | null;
  idempotent: boolean;
  /** Legacy, source-less rewards that were intentionally left unchanged. */
  legacyRewardCandidates: number;
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

  const baseAmount = score * rewardPerPoint;
  const amount = isFeatureEnabled("petGame")
    ? Math.round(
        baseAmount *
          (1 + (await getStudentPetEffects(db, input.student.id)).readingRewardBps / 10_000),
      )
    : baseAmount;
  if (amount <= 0) return null;

  const { accountId } = await ensureAccountFor(input.student);
  const currency = await db.classroomCurrency.findUnique({
    where: { classroomId: input.student.classroomId },
    select: { unitLabel: true },
  });
  const unitLabel = currency?.unitLabel ?? "\uC6D0";

  let rewardedAmount: number;
  try {
    rewardedAmount = await db.$transaction(async (tx) => {
      // A retried POST (or a client retry after a network timeout) must not
      // credit the same reading log twice. The compound unique index is the
      // final race gate; this lookup handles the normal retry path.
      const existing = await tx.transaction.findFirst({
        where: {
          accountId,
          sourceType: READING_REWARD_SOURCE_TYPE,
          sourceRef: input.readingLogId,
          type: "deposit",
        },
        select: { amount: true },
      });
      if (existing) return existing.amount;

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
          note: `${LEGACY_READING_REWARD_NOTE_PREFIX} \uBCF4\uC0C1 [reading-log:${input.readingLogId}] (\uC810\uC218: ${score})`,
          sourceType: READING_REWARD_SOURCE_TYPE,
          sourceRef: input.readingLogId,
          performedById: input.student.id,
          performedByKind: "owner",
        } satisfies Prisma.TransactionUncheckedCreateInput,
      });
      return amount;
    });
  } catch (error) {
    // If two requests race before either sees the source row, the unique
    // constraint collapses the loser into the same idempotent result.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const existing = await db.transaction.findFirst({
      where: {
        accountId,
        sourceType: READING_REWARD_SOURCE_TYPE,
        sourceRef: input.readingLogId,
        type: "deposit",
      },
      select: { amount: true },
    });
    if (!existing) throw error;
    rewardedAmount = existing.amount;
  }

  return { amount: rewardedAmount, unitLabel };
}

/**
 * Reverse the source-specific reward for one reading log inside an existing
 * Prisma transaction. Only the exact reward deposit is considered; student
 * purchases and unrelated deposits are never refunded.
 */
export async function reverseReadingReward(
  tx: Prisma.TransactionClient,
  input: { studentId: string; readingLogId: string; performerId: string },
): Promise<ReadingRewardReversalResult> {
  const account = await tx.studentAccount.findUnique({
    where: { studentId: input.studentId },
    select: { id: true, balance: true },
  });
  if (!account) {
    return { amount: 0, balance: null, idempotent: false, legacyRewardCandidates: 0 };
  }

  const legacyRewardCandidates = await tx.transaction.count({
    where: {
      accountId: account.id,
      type: "deposit",
      sourceType: null,
      sourceRef: null,
      note: { startsWith: LEGACY_READING_REWARD_NOTE_PREFIX },
    },
  });

  const existingReversal = await tx.transaction.findFirst({
    where: {
      accountId: account.id,
      sourceType: READING_REWARD_REVERSAL_SOURCE_TYPE,
      sourceRef: input.readingLogId,
      type: "withdraw",
    },
    select: { amount: true },
  });
  if (existingReversal) {
    return {
      amount: existingReversal.amount,
      balance: account.balance,
      idempotent: true,
      legacyRewardCandidates,
    };
  }

  const reward = await tx.transaction.findFirst({
    where: {
      accountId: account.id,
      sourceType: READING_REWARD_SOURCE_TYPE,
      sourceRef: input.readingLogId,
      type: "deposit",
    },
    select: { amount: true },
  });
  if (!reward || reward.amount <= 0) {
    return {
      amount: 0,
      balance: account.balance,
      idempotent: false,
      legacyRewardCandidates,
    };
  }

  // Guard the decrement itself so a concurrent purchase cannot make the
  // balance negative between the read above and this update.
  const changed = await tx.studentAccount.updateMany({
    where: { id: account.id, balance: { gte: reward.amount } },
    data: { balance: { decrement: reward.amount } },
  });
  if (changed.count === 0) {
    throw new ReadingRewardReversalError("insufficient_balance");
  }

  const updated = await tx.studentAccount.findUniqueOrThrow({
    where: { id: account.id },
    select: { balance: true },
  });
  await tx.transaction.create({
    data: {
      accountId: account.id,
      type: "withdraw",
      amount: reward.amount,
      balanceAfter: updated.balance,
      note: `\uB3C5\uC11C \uAE30\uB85D \uC0AD\uC81C \uD658\uC218 [reading-log:${input.readingLogId}]`,
      sourceType: READING_REWARD_REVERSAL_SOURCE_TYPE,
      sourceRef: input.readingLogId,
      performedById: input.performerId,
      performedByKind: "teacher",
    } satisfies Prisma.TransactionUncheckedCreateInput,
  });

  return {
    amount: reward.amount,
    balance: updated.balance,
    idempotent: false,
    legacyRewardCandidates,
  };
}
