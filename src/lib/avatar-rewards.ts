// Reading reward hook for the avatar customization MVP (2026-07-02).
//
// When a student posts a ReadingLog with aiScore >= the classroom
// `readingMinScoreForPayout` config, we credit the existing wallet with
// `score * readingRewardPerPoint` won, written as a normal Transaction
// with type `deposit` and performerKind `owner` (the existing convention for
// student-owned wallet actions).
//
// The student reading route supplies its own transaction so ReadingLog,
// wallet, Transaction, and growth either commit or roll back together.
import "server-only";
import { db } from "./db";
import { ensureAccountFor } from "./bank";
import { Prisma } from "@prisma/client";
import { awardCappedPolicyReward, loadRewardPolicy } from "./reward-service";

export type ReadingRewardResult = {
  amount: number;
  unitLabel: string;
} | null;

export type AwardReadingRewardInput = {
  student: { id: string; classroomId: string };
  score: number | null;
  readingLogId: string;
  tx?: Prisma.TransactionClient;
  accountId?: string;
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

const MAX_READING_REWARD_TRANSACTION_ATTEMPTS = 3;

export function isSerializableTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/** Retry only serialization conflicts; each attempt reruns wallet + growth atomically. */
export async function retryReadingRewardTransaction<T>(
  operation: () => Promise<T>,
  maxAttempts = MAX_READING_REWARD_TRANSACTION_ATTEMPTS,
): Promise<T> {
  let attempts = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempts += 1;
      if (!isSerializableTransactionConflict(error) || attempts >= maxAttempts) throw error;
    }
  }
}

export async function awardReadingReward(
  input: AwardReadingRewardInput,
): Promise<ReadingRewardResult> {
  const score = input.score;
  if (typeof score !== "number" || score <= 0) return null;

  const awardInTransaction = async (
    tx: Prisma.TransactionClient,
    accountId: string,
  ): Promise<ReadingRewardResult> => {
    const [currency, policy] = await Promise.all([
      tx.classroomCurrency.findUnique({
        where: { classroomId: input.student.classroomId },
        select: { unitLabel: true },
      }),
      loadRewardPolicy(tx, input.student.classroomId),
    ]);
    if (score < policy.readingMinScoreForPayout) return null;
    const result = await awardCappedPolicyReward({
      tx,
      studentId: input.student.id,
      classroomId: input.student.classroomId,
      accountId,
      area: "reading",
      sourceRef: input.readingLogId,
      baseAmount: score * policy.readingRewardPerPoint,
      note: `독서 기록 보상 [reading-log:${input.readingLogId}] (점수: ${score})`,
      policy,
    });
    return result ? { amount: result.amount, unitLabel: currency?.unitLabel ?? "원" } : null;
  };

  if (input.tx) {
    if (!input.accountId) throw new Error("Reading reward account is required in caller transaction");
    return awardInTransaction(input.tx, input.accountId);
  }

  const { accountId } = await ensureAccountFor(input.student);
  let reward: ReadingRewardResult;
  try {
    reward = await retryReadingRewardTransaction(() =>
      db.$transaction(
        (tx) => awardInTransaction(tx, accountId),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
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
    const currency = await db.classroomCurrency.findUnique({
      where: { classroomId: input.student.classroomId },
      select: { unitLabel: true },
    });
    reward = { amount: existing.amount, unitLabel: currency?.unitLabel ?? "원" };
  }

  return reward;
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
    await tx.creatureProgressEvent.updateMany({
      where: {
        studentId: input.studentId,
        sourceType: READING_REWARD_SOURCE_TYPE,
        sourceRef: input.readingLogId,
        reversedAt: null,
      },
      data: { reversedAt: new Date() },
    });
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
  // Wallet compensation is reversible; growth stays monotonic. The original
  // event is marked for audit without subtracting points or downgrading stage.
  await tx.creatureProgressEvent.updateMany({
    where: {
      studentId: input.studentId,
      sourceType: READING_REWARD_SOURCE_TYPE,
      sourceRef: input.readingLogId,
      reversedAt: null,
    },
    data: { reversedAt: new Date() },
  });

  return {
    amount: reward.amount,
    balance: updated.balance,
    idempotent: false,
    legacyRewardCandidates,
  };
}
