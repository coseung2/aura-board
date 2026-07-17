import "server-only";

import { Prisma } from "@prisma/client";

import {
  applyVerifiedRewardProgress,
  type CreatureRewardProgressResult,
} from "./reward-progress";

/** Activity reward namespaces owned by the server. */
export const ACTIVITY_REWARD_SOURCE_TYPES = [
  "walking_reward",
  "assignment_reward",
] as const;

export type ActivityRewardSourceType = (typeof ACTIVITY_REWARD_SOURCE_TYPES)[number];

export type ActivityRewardInput = {
  tx: Prisma.TransactionClient;
  studentId: string;
  classroomId: string;
  accountId: string;
  sourceType: ActivityRewardSourceType;
  sourceRef: string;
  amount: number;
};

export type ActivityRewardProgressSummary = {
  progressEventId: string | null;
  progressDelta: number;
  stageBefore: string | null;
  stageAfter: string | null;
};

export type ActivityRewardResult = {
  transactionId: string;
  amount: number;
  idempotent: boolean;
  progress: ActivityRewardProgressSummary;
};

export function walkingRewardSourceRef(studentId: string, day: string): string {
  return `${studentId}:${day}:daily-threshold`;
}

export function assignmentRewardSourceRef(studentId: string, slotId: string): string {
  return `${studentId}:${slotId}:first-submit`;
}

export function shouldAwardWalkingReward(
  steps: number,
  threshold: number,
  amount: number,
): boolean {
  return (
    Number.isSafeInteger(steps) &&
    Number.isSafeInteger(threshold) &&
    Number.isSafeInteger(amount) &&
    threshold > 0 &&
    amount > 0 &&
    steps >= threshold
  );
}

const MAX_ACTIVITY_REWARD_TRANSACTION_ATTEMPTS = 3;

function isActivityRewardSourceType(value: string): value is ActivityRewardSourceType {
  return (ACTIVITY_REWARD_SOURCE_TYPES as readonly string[]).includes(value);
}

function assertActivityRewardInput(input: ActivityRewardInput): void {
  if (!input.studentId || !input.classroomId || !input.accountId) {
    throw new Error("Activity reward identity is required");
  }
  if (!isActivityRewardSourceType(input.sourceType)) {
    throw new Error("Unsupported activity reward source");
  }
  if (
    typeof input.sourceRef !== "string" ||
    input.sourceRef.trim().length === 0 ||
    input.sourceRef.length > 300 ||
    /[\u0000-\u001f\u007f]/.test(input.sourceRef)
  ) {
    throw new Error("Activity reward source reference is required");
  }
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error("Activity reward amount must be a positive integer");
  }
}

function progressSummary(
  result: CreatureRewardProgressResult | null,
): ActivityRewardProgressSummary {
  return {
    progressEventId: result?.progressEventId ?? null,
    progressDelta: result?.progressDelta ?? 0,
    stageBefore: result?.stageBefore ?? null,
    stageAfter: result?.stageAfter ?? null,
  };
}

/**
 * Apply one server-verified activity reward inside the caller's transaction.
 *
 * The source deposit is the wallet idempotency gate. On replay this function
 * returns before calling creature progress so a reward earned before a later
 * creature purchase cannot grow that new creature.
 */
export async function awardActivityReward(
  input: ActivityRewardInput,
): Promise<ActivityRewardResult> {
  assertActivityRewardInput(input);

  const account = await input.tx.studentAccount.findUnique({
    where: { id: input.accountId },
    select: { id: true, studentId: true, classroomId: true },
  });
  if (
    !account ||
    account.studentId !== input.studentId ||
    account.classroomId !== input.classroomId
  ) {
    throw new Error("Activity reward account does not belong to student");
  }

  // Source rows are globally unique. Looking them up without accountId also
  // prevents a malformed source namespace from being paid into a second
  // student's account after a source collision.
  const existing = await input.tx.transaction.findFirst({
    where: {
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      type: "deposit",
    },
    select: { id: true, accountId: true, amount: true },
  });
  if (existing) {
    if (existing.accountId !== input.accountId) {
      throw new Error("Activity reward source belongs to another account");
    }
    return {
      transactionId: existing.id,
      amount: existing.amount,
      idempotent: true,
      progress: progressSummary(null),
    };
  }

  const updated = await input.tx.studentAccount.update({
    where: { id: input.accountId },
    data: { balance: { increment: input.amount } },
    select: { balance: true },
  });
  const transaction = await input.tx.transaction.create({
    data: {
      accountId: input.accountId,
      type: "deposit",
      amount: input.amount,
      balanceAfter: updated.balance,
      note: `${input.sourceType} reward [${input.sourceRef}]`,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      performedById: input.studentId,
      performedByKind: "owner",
    } satisfies Prisma.TransactionUncheckedCreateInput,
    select: { id: true },
  });

  const creatureProgress = await applyVerifiedRewardProgress(input.tx, {
    studentId: input.studentId,
    classroomId: input.classroomId,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    currencyAmount: input.amount,
  });

  return {
    transactionId: transaction.id,
    amount: input.amount,
    idempotent: false,
    progress: progressSummary(creatureProgress),
  };
}

export function isSerializableTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/** Retry the complete activity transaction on bounded serializable conflicts. */
export async function retryActivityRewardTransaction<T>(
  operation: () => Promise<T>,
  maxAttempts = MAX_ACTIVITY_REWARD_TRANSACTION_ATTEMPTS,
  shouldRetryAdditionalError?: (error: unknown) => boolean | Promise<boolean>,
): Promise<T> {
  let attempts = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempts += 1;
      const serializableConflict = isSerializableTransactionConflict(error);
      const retryAdditional =
        !serializableConflict &&
        (await shouldRetryAdditionalError?.(error) ?? false);
      if (
        (!serializableConflict && !retryAdditional) ||
        attempts >= maxAttempts
      ) {
        throw error;
      }
    }
  }
}

/** A slot is reward-eligible only on its first accepted transition. */
export function isFirstAssignmentSubmission(input: {
  submissionStatus: string;
  hasExistingSubmission: boolean;
}): boolean {
  return input.submissionStatus === "assigned" && !input.hasExistingSubmission;
}
