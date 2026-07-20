import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  ensureAccountFor: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  transactionFindFirst: vi.fn(),
  loadRewardPolicy: vi.fn(),
  awardWalkingPolicyReward: vi.fn(),
  retryActivityRewardTransaction: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: mocks.getCurrentStudent,
}));
vi.mock("@/lib/bank", () => ({
  ensureAccountFor: mocks.ensureAccountFor,
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
    transaction: { findFirst: mocks.transactionFindFirst },
  },
}));
vi.mock("@/lib/reward-service", () => ({
  loadRewardPolicy: mocks.loadRewardPolicy,
  awardWalkingPolicyReward: mocks.awardWalkingPolicyReward,
}));
vi.mock("@/lib/creatures/activity-rewards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/creatures/activity-rewards")>(
    "@/lib/creatures/activity-rewards",
  );
  return {
    ...actual,
    retryActivityRewardTransaction: mocks.retryActivityRewardTransaction,
  };
});

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/student/walking/rewards/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/student/walking/rewards/claim", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T03:00:00.000Z"));
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.ensureAccountFor.mockResolvedValue({ accountId: "account-1", cardId: "card-1" });
    mocks.queryRaw.mockResolvedValue([{ steps: 75_000 }]);
    mocks.transactionFindFirst.mockResolvedValue(null);
    mocks.loadRewardPolicy.mockResolvedValue({
      walkingWeeklyTier1Steps: 25_000,
      walkingWeeklyTier1Amount: 20,
      walkingWeeklyTier2Steps: 50_000,
      walkingWeeklyTier2Amount: 40,
      walkingWeeklyTier3Steps: 75_000,
      walkingWeeklyTier3Amount: 100,
    });
    mocks.awardWalkingPolicyReward.mockResolvedValue({ amount: 20, idempotent: false });
    mocks.retryActivityRewardTransaction.mockImplementation(
      (operation: () => Promise<unknown>) => operation(),
    );
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => unknown) =>
      operation({
        $queryRaw: mocks.queryRaw,
        transaction: { findFirst: mocks.transactionFindFirst },
      }),
    );
  });

  it("rejects unauthenticated students", async () => {
    mocks.getCurrentStudent.mockResolvedValue(null);
    const response = await POST(request({ tierKey: "tier1" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects an invalid tier key", async () => {
    const response = await POST(request({ tierKey: "tier4" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_payload");
  });

  it("does not pay a tier below the persisted current-week total", async () => {
    mocks.queryRaw.mockResolvedValue([{ steps: 24_999 }]);
    const response = await POST(request({ tierKey: "tier1" }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("reward_not_achieved");
    expect(mocks.awardWalkingPolicyReward).not.toHaveBeenCalled();
  });

  it("pays an achieved tier using server policy values", async () => {
    const response = await POST(request({ tierKey: "tier1" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      tier: { key: "tier1", steps: 25_000, amount: 20, achieved: true, claimed: true },
      rewardAmount: 20,
      idempotent: false,
    });
    expect(mocks.awardWalkingPolicyReward).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRef: "student-1:2026-07-20:weekly-tier:tier1",
        baseAmount: 20,
        sourceType: "walking_weekly_reward",
      }),
    );
  });

  it("replays an exact source deposit without paying again", async () => {
    mocks.awardWalkingPolicyReward.mockResolvedValue({ amount: 23, idempotent: true });
    const response = await POST(request({ tierKey: "tier2" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      tier: { key: "tier2", claimed: true },
      rewardAmount: 23,
      idempotent: true,
    });
  });

  it("keeps historical weekly-goal tier one deposits claimed", async () => {
    mocks.queryRaw.mockResolvedValue([{ steps: 25_000 }]);
    mocks.transactionFindFirst.mockResolvedValue({
      id: "transaction-1",
      accountId: "account-1",
      amount: 20,
    });
    const response = await POST(request({ tierKey: "tier1" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      tier: { key: "tier1", claimed: true },
      rewardAmount: 20,
      idempotent: true,
    });
    expect(mocks.awardWalkingPolicyReward).not.toHaveBeenCalled();
  });
});
