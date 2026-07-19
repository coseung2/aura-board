import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const applyProgress = vi.hoisted(() => vi.fn());

vi.mock("./reward-progress", () => ({
  applyVerifiedRewardProgress: applyProgress,
}));

import {
  ACTIVITY_REWARD_SOURCE_TYPES,
  awardActivityReward,
  assignmentRewardSourceRef,
  isFirstAssignmentSubmission,
  retryActivityRewardTransaction,
  shouldAwardWalkingReward,
  walkingRewardSourceRef,
} from "./activity-rewards";

type StoredTransaction = {
  id: string;
  accountId: string;
  amount: number;
  sourceType: string;
  sourceRef: string;
};

function fakeTx(existing: StoredTransaction | null = null) {
  let balance = 10;
  let transaction = existing;
  const tx = {
    studentAccount: {
      findUnique: vi.fn(async () => ({
        id: "account-1",
        studentId: "student-1",
        classroomId: "classroom-1",
      })),
      update: vi.fn(async () => ({ balance: (balance += 20) })),
    },
    transaction: {
      findFirst: vi.fn(async () => transaction),
      create: vi.fn(async ({ data }: { data: StoredTransaction }) => {
        transaction = {
          id: "transaction-1",
          accountId: data.accountId,
          amount: data.amount,
          sourceType: data.sourceType,
          sourceRef: data.sourceRef,
        };
        return { id: transaction.id };
      }),
    },
  } as unknown as Prisma.TransactionClient;
  return tx;
}

describe("activity reward source policy", () => {
  it("retries a verified source P2002 but not unrelated P2002", async () => {
    const sourceConflict = new Prisma.PrismaClientKnownRequestError("source", {
      code: "P2002",
      clientVersion: "test",
    });
    let attempts = 0;
    const retried = await retryActivityRewardTransaction(
      async () => {
        attempts += 1;
        if (attempts === 1) throw sourceConflict;
        return "committed";
      },
      3,
      (error) => error === sourceConflict,
    );
    expect(retried).toBe("committed");
    expect(attempts).toBe(2);

    let unrelatedAttempts = 0;
    await expect(
      retryActivityRewardTransaction(
        async () => {
          unrelatedAttempts += 1;
          throw sourceConflict;
        },
        3,
        () => false,
      ),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(unrelatedAttempts).toBe(1);
  });

  it("keeps walking and assignment source namespaces distinct", () => {
    expect(ACTIVITY_REWARD_SOURCE_TYPES).toEqual([
      "reading_reward",
      "walking_reward",
      "walking_weekly_reward",
      "assignment_reward",
      "comment_reward",
    ]);
    expect(walkingRewardSourceRef("student-1", "2026-07-17")).toBe(
      "student-1:2026-07-17:daily-threshold",
    );
    expect(assignmentRewardSourceRef("student-1", "slot-1")).toBe(
      "student-1:slot-1:first-submit",
    );
    expect(walkingRewardSourceRef("student-1", "same")).not.toBe(
      assignmentRewardSourceRef("student-1", "same"),
    );
  });

  it("pays walking only when both configured gates are positive and met", () => {
    expect(shouldAwardWalkingReward(5_000, 5_000, 20)).toBe(true);
    expect(shouldAwardWalkingReward(4_999, 5_000, 20)).toBe(false);
    expect(shouldAwardWalkingReward(5_000, 0, 20)).toBe(false);
    expect(shouldAwardWalkingReward(5_000, 5_000, 0)).toBe(false);
  });

  it("rejects zero, negative, fractional, and unsafe reward amounts", async () => {
    for (const amount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        awardActivityReward({
          tx: fakeTx(),
          studentId: "student-1",
          classroomId: "classroom-1",
          accountId: "account-1",
          sourceType: "walking_reward",
          sourceRef: "student-1:2026-07-17:daily-threshold",
          amount,
        }),
      ).rejects.toThrow("positive integer");
    }
  });

  it("replays an existing source deposit without retroactive creature progress", async () => {
    applyProgress.mockReset();
    const tx = fakeTx({
      id: "transaction-existing",
      accountId: "account-1",
      amount: 20,
      sourceType: "walking_reward",
      sourceRef: "student-1:2026-07-17:daily-threshold",
    });

    const result = await awardActivityReward({
      tx,
      studentId: "student-1",
      classroomId: "classroom-1",
      accountId: "account-1",
      sourceType: "walking_reward",
      sourceRef: "student-1:2026-07-17:daily-threshold",
      amount: 20,
    });

    expect(result).toMatchObject({
      transactionId: "transaction-existing",
      amount: 20,
      idempotent: true,
      progress: { progressDelta: 0, progressEventId: null },
    });
    expect(applyProgress).not.toHaveBeenCalled();
  });

  it("marks only an assigned slot with no prior submission as first-submit", () => {
    expect(
      isFirstAssignmentSubmission({ submissionStatus: "assigned", hasExistingSubmission: false }),
    ).toBe(true);
    expect(
      isFirstAssignmentSubmission({ submissionStatus: "submitted", hasExistingSubmission: false }),
    ).toBe(false);
    expect(
      isFirstAssignmentSubmission({ submissionStatus: "assigned", hasExistingSubmission: true }),
    ).toBe(false);
  });
});
