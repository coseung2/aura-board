import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  transactionFindMany: vi.fn(),
  transactionFindFirst: vi.fn(),
  rewardConfig: vi.fn(),
  representativeSlime: vi.fn(),
  getStudentMonthlyAttendance: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: mocks.getCurrentStudent,
}));
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    $transaction: mocks.transaction,
    transaction: {
      findMany: mocks.transactionFindMany,
      findFirst: mocks.transactionFindFirst,
    },
    studentSlime: { findFirst: mocks.representativeSlime },
  },
}));
vi.mock("@/lib/student-attendance", () => ({
  getStudentMonthlyAttendance: mocks.getStudentMonthlyAttendance,
  recordStudentAttendanceVisit: vi.fn(),
}));

import { GET } from "./route";

describe("GET /api/student/walking fixed KST week", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.queryRaw.mockResolvedValue([]);
    mocks.transactionFindMany.mockResolvedValue([]);
    mocks.transactionFindFirst.mockResolvedValue(null);
    mocks.rewardConfig.mockResolvedValue(null);
    mocks.representativeSlime.mockResolvedValue(null);
    mocks.getStudentMonthlyAttendance.mockResolvedValue({
      month: "2026-07",
      monthDays: 28,
      attendanceCount: 0,
      attendanceDays: [],
      visitCount: 0,
      claimedOrdinals: [],
      claimableAttendance: [],
      itemRewardOrdinal: 28,
      itemEarned: false,
      nextOrdinalReward: { ordinal: 1, type: "cash", amount: 10 },
    });
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

  it("includes the current classroom's weekly Top 5 and marks the current student", async () => {
    vi.setSystemTime(new Date("2026-07-23T03:00:00.000Z"));
    mocks.queryRaw.mockImplementation(async (query: { strings?: TemplateStringsArray }) => {
      const source = query.strings?.join("?") ?? "";
      if (source.includes('AS "weeklySteps"')) {
        return [
          {
            studentId: "student-2",
            studentNumber: 4,
            studentName: "김하늘",
            weeklySteps: BigInt(21_680),
          },
          {
            studentId: "student-1",
            studentNumber: 25,
            studentName: "테스트",
            weeklySteps: BigInt(5_780),
          },
        ];
      }
      if (source.includes('SELECT "rank"')) return [{ rank: 2 }];
      return [];
    });

    const response = await GET(new NextRequest("http://localhost/api/student/walking"));
    const body = await response.json();

    expect(body.classroomTopFive).toEqual([
      {
        studentId: "student-2",
        studentNumber: 4,
        studentName: "김하늘",
        weeklySteps: 21_680,
        isCurrent: false,
        rewardAmount: 100,
      },
      {
        studentId: "student-1",
        studentNumber: 25,
        studentName: "테스트",
        weeklySteps: 5_780,
        isCurrent: true,
        rewardAmount: 60,
      },
    ]);
    expect(body.classroomRankRewards).toEqual([
      { weekStart: "2026-07-13", rank: 2, amount: 60 },
    ]);
    const rankQueries = mocks.queryRaw.mock.calls.map(
      ([query]: [{ strings?: TemplateStringsArray }]) => query.strings?.join("?") ?? "",
    );
    expect(rankQueries.filter((source) => source.includes('AS "weeklySteps"'))[0]).toContain(
      'HAVING COALESCE(SUM(walking."steps"), 0) > 0',
    );
    expect(rankQueries.filter((source) => source.includes('SELECT "rank"'))[0]).toContain(
      'HAVING COALESCE(SUM(walking."steps"), 0) > 0',
    );
    expect(body.classroomRankNextResetAt).toBe("2026-07-26T15:00:00.000Z");
  });

  it("includes the current representative slime for the mission progress marker", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    mocks.representativeSlime.mockResolvedValue({
      color: "purple",
      growthStage: 2,
      equippedItemKeys: ["water-puddle-background"],
    });

    const response = await GET(new NextRequest("http://localhost/api/student/walking"));

    expect(await response.json()).toMatchObject({
      representativeSlime: {
        color: "purple",
        growthStage: 2,
        equippedFloor: "none",
      },
    });
    expect(mocks.representativeSlime).toHaveBeenCalledWith({
      where: { studentId: "student-1", isRepresentative: true },
      select: { color: true, growthStage: true, equippedItemKeys: true },
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

  it("exposes claimed and still-claimable attendance ordinals", async () => {
    mocks.getStudentMonthlyAttendance.mockResolvedValue({
      month: "2026-07",
      monthDays: 28,
      attendanceCount: 4,
      attendanceDays: ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"],
      visitCount: 5,
      claimedOrdinals: [1, 2, 3, 4],
      claimableAttendance: [{ ordinal: 5, day: "2026-07-05" }],
      itemRewardOrdinal: 28,
      itemEarned: false,
      nextOrdinalReward: { ordinal: 5, type: "cash", amount: 10 },
    });
    const response = await GET(new NextRequest("http://localhost/api/student/walking"));
    const body = await response.json();

    expect(body.monthlyAttendanceReward).toMatchObject({
      month: "2026-07",
      monthDays: 28,
      attendanceCount: 4,
      visitCount: 5,
      claimedOrdinals: [1, 2, 3, 4],
      claimableAttendance: [{ ordinal: 5, day: "2026-07-05" }],
      eligibleAttendanceDays: ["2026-07-05"],
      nextOrdinalReward: { ordinal: 5, type: "cash", amount: 10 },
    });
    expect(mocks.getStudentMonthlyAttendance).toHaveBeenCalledWith("student-1");
  });
});
