import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  transactionFindMany: vi.fn(),
  rewardConfig: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: mocks.getCurrentStudent,
}));
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    $transaction: mocks.transaction,
    transaction: { findMany: mocks.transactionFindMany },
  },
}));

import { GET } from "./route";

describe("GET /api/student/walking fixed KST week", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.queryRaw.mockResolvedValue([]);
    mocks.transactionFindMany.mockResolvedValue([]);
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

  it("exposes current-week totals and preserves historical tier claims", async () => {
    vi.setSystemTime(new Date("2026-07-23T03:00:00.000Z"));
    mocks.queryRaw.mockResolvedValue([
      { day: "2026-07-20", steps: 25_000, distanceMeters: 0, syncedAt: "2026-07-20T01:00:00.000Z" },
      { day: "2026-07-21", steps: 25_000, distanceMeters: 0, syncedAt: "2026-07-21T01:00:00.000Z" },
    ]);
    mocks.transactionFindMany.mockResolvedValue([
      {
        sourceRef: "student-1:2026-07-20:weekly-tier:tier1",
        amount: 20,
      },
    ]);

    const response = await GET(new NextRequest("http://localhost/api/student/walking"));
    const body = await response.json();

    expect(body.weeklyStepRewards).toMatchObject({
      weekStart: "2026-07-20",
      totalSteps: 50_000,
      maxSteps: 75_000,
      tiers: [
        { key: "tier1", steps: 25_000, amount: 20, achieved: true, claimed: true },
        { key: "tier2", steps: 50_000, amount: 40, achieved: true, claimed: false },
        { key: "tier3", steps: 75_000, amount: 100, achieved: false, claimed: false },
      ],
    });
  });

  it.each([
    ["2026-02-28T03:00:00.000Z", "2026-02", 28],
    ["2028-02-29T03:00:00.000Z", "2028-02", 29],
    ["2026-04-30T03:00:00.000Z", "2026-04", 30],
    ["2026-07-31T03:00:00.000Z", "2026-07", 31],
  ])("builds the fixed 28-slot monthly ordinal board for %s", async (instant, month, calendarDays) => {
    vi.setSystemTime(new Date(instant));
    mocks.queryRaw.mockResolvedValue(
      Array.from({ length: calendarDays as number }, (_, index) => {
        const day = String(index + 1).padStart(2, "0");
        return {
          day: `${month}-${day}`,
          steps: 0,
          distanceMeters: 0,
          syncedAt: `${month}-${day}T01:00:00.000Z`,
        };
      }),
    );
    const response = await GET(new NextRequest("http://localhost/api/student/walking"));
    const body = await response.json();

    expect(body.monthlyAttendanceReward).toMatchObject({
      month,
      monthDays: 28,
      attendanceCount: 28,
      itemRewardOrdinal: 28,
      itemEarned: true,
      nextOrdinalReward: null,
    });
    expect(body.monthlyAttendanceReward.cashPaid).toBe(0);
  });

  it("keeps missed visit ordinals claimable after a later ordinal is claimed", async () => {
    vi.setSystemTime(new Date("2026-07-23T03:00:00.000Z"));
    mocks.queryRaw.mockResolvedValue([
      {
        day: "2026-07-20",
        steps: 0,
        distanceMeters: 0,
        syncedAt: "2026-07-20T01:00:00.000Z",
        attendanceVisitedAt: "2026-07-20T01:00:00.000Z",
        attendanceMonth: "2026-07",
        attendanceOrdinal: 1,
        attendanceCompletedAt: null,
      },
      {
        day: "2026-07-21",
        steps: 0,
        distanceMeters: 0,
        syncedAt: "2026-07-21T01:00:00.000Z",
        attendanceVisitedAt: "2026-07-21T01:00:00.000Z",
        attendanceMonth: "2026-07",
        attendanceOrdinal: 2,
        attendanceCompletedAt: "2026-07-22T01:00:00.000Z",
      },
    ]);

    const response = await GET(new NextRequest("http://localhost/api/student/walking"));
    const body = await response.json();

    expect(body.monthlyAttendanceReward).toMatchObject({
      attendanceCount: 1,
      visitCount: 2,
      claimedOrdinals: [2],
      claimableAttendance: [{ ordinal: 1, day: "2026-07-20" }],
    });
  });

  it("reports chronological attendance and paid cash without claiming an item grant", async () => {
    vi.setSystemTime(new Date("2026-07-23T03:00:00.000Z"));
    mocks.queryRaw.mockResolvedValue([
      { day: "2026-07-01", steps: 0, distanceMeters: 0, syncedAt: "2026-07-01T01:00:00.000Z" },
      { day: "2026-07-03", steps: 0, distanceMeters: 0, syncedAt: "2026-07-03T01:00:00.000Z" },
      { day: "2026-07-02", steps: 0, distanceMeters: 0, syncedAt: "2026-07-02T01:00:00.000Z" },
      { day: "2026-07-03", steps: 0, distanceMeters: 0, syncedAt: "2026-07-03T02:00:00.000Z" },
      { day: "2026-07-04", steps: 0, distanceMeters: 0, syncedAt: "2026-07-04T01:00:00.000Z" },
      { day: "2026-07-05", steps: 0, distanceMeters: 0, syncedAt: "2026-07-05T01:00:00.000Z" },
    ]);
    mocks.transactionFindMany.mockResolvedValue([
      {
        sourceRef: "student-1:2026-07:attendance:1",
        amount: 10,
      },
      {
        sourceRef: "student-1:2026-07:attendance:2",
        amount: 10,
      },
    ]);
    const response = await GET(new NextRequest("http://localhost/api/student/walking"));
    const body = await response.json();

    expect(body.monthlyAttendanceReward).toMatchObject({
      month: "2026-07",
      monthDays: 28,
      attendanceCount: 5,
      cashEarned: 50,
      cashPaid: 20,
      nextOrdinalReward: { ordinal: 6, type: "cash", amount: 10 },
      itemRewardOrdinal: 28,
      itemEarned: false,
    });
    expect(body.monthlyAttendanceReward.itemGranted).toBeUndefined();
    expect(mocks.transactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceType: "walking_weekly_reward",
          sourceRef: { startsWith: "student-1:2026-07:attendance:" },
        }),
      }),
    );
  });
});
