import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  rewardConfig: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: mocks.getCurrentStudent,
}));
vi.mock("@/lib/db", () => ({
  db: { $queryRaw: mocks.queryRaw, $transaction: mocks.transaction },
}));

import { GET } from "./route";

describe("GET /api/student/walking fixed KST week", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.queryRaw.mockResolvedValue([]);
    mocks.rewardConfig.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => unknown) =>
      operation({ avatarRewardConfig: { findUnique: mocks.rewardConfig } }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["2026-07-19T14:59:59.999Z", "2026-07-13", "2026-07-20"],
    ["2026-07-19T15:00:00.000Z", "2026-07-20", "2026-07-27"],
  ])("returns the fixed Monday-to-next-Monday range at %s", async (instant, weekStart, weekEnd) => {
    vi.setSystemTime(new Date(instant));
    const response = await GET(new NextRequest("http://localhost/api/student/walking"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      rows: [],
      range: { weekStart, weekEnd },
    });
  });

  it("keeps the legacy days query accepted while exposing the policy week range", async () => {
    vi.setSystemTime(new Date("2026-07-19T14:59:59.999Z"));
    const response = await GET(
      new NextRequest("http://localhost/api/student/walking?days=7"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      rows: [],
      range: { weekStart: "2026-07-13", weekEnd: "2026-07-20" },
    });
  });

  it("exposes classroom walking policy without leaking unrelated reward settings", async () => {
    mocks.rewardConfig.mockResolvedValue({
      walkingRewardStepThreshold: 6_000,
      walkingRewardAmount: 15,
      walkingDailyUnitCap: 3,
      walkingWeeklyRewardDayCap: 4,
      walkingWeeklyTier1Steps: 20_000,
      walkingWeeklyTier1Amount: 11,
      walkingWeeklyTier2Steps: 40_000,
      walkingWeeklyTier2Amount: 22,
      walkingWeeklyTier3Steps: 60_000,
      walkingWeeklyTier3Amount: 55,
      readingRewardPerPoint: 999,
      rewardBuffCapBps: 9999,
    });
    const response = await GET(new NextRequest("http://localhost/api/student/walking"));
    const body = await response.json();

    expect(body.policy).toEqual({
      stepThreshold: 6_000,
      dailyUnitAmount: 15,
      dailyUnitCap: 3,
      weeklyRewardDayCap: 4,
      weeklyTiers: [
        { key: "tier1", steps: 20_000, amount: 11 },
        { key: "tier2", steps: 40_000, amount: 22 },
        { key: "tier3", steps: 60_000, amount: 55 },
      ],
    });
    expect(body.policy.readingRewardPerPoint).toBeUndefined();
    expect(body.policy.rewardBuffCapBps).toBeUndefined();
  });
});
