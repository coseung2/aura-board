import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { walkingMonthlyAttendanceSourceRef } from "@/lib/reward-policy";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  ensureAccountFor: vi.fn(),
  retryTransaction: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  txQueryRaw: vi.fn(),
  txExecuteRaw: vi.fn(),
  transactionFindMany: vi.fn(),
  transactionFindFirst: vi.fn(),
  awardActivityReward: vi.fn(),
  awardAttendanceCookie: vi.fn(),
  getStudentMonthlyAttendance: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/bank", () => ({ ensureAccountFor: mocks.ensureAccountFor }));
vi.mock("@/lib/creatures/activity-rewards", () => ({
  awardActivityReward: mocks.awardActivityReward,
  retryActivityRewardTransaction: mocks.retryTransaction,
}));
vi.mock("@/lib/walking-attendance-rewards", () => ({
  awardWalkingAttendanceCookie: mocks.awardAttendanceCookie,
}));
vi.mock("@/lib/student-attendance", () => ({
  getStudentMonthlyAttendance: mocks.getStudentMonthlyAttendance,
  recordStudentAttendanceVisit: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    $transaction: mocks.transaction,
    transaction: { findFirst: mocks.transactionFindFirst },
  },
}));

import { POST } from "./route";

const student = { id: "student-1", classroomId: "classroom-1" };
const day = "2026-08-10";
const syncedRow = {
  day,
  steps: 12_345,
  distanceMeters: 4_321.25,
  syncedAt: "2026-08-10T01:00:00.000Z",
  attendanceVisitedAt: "2026-08-10T01:05:00.000Z",
  attendanceMonth: "2026-08",
  attendanceOrdinal: 1,
  attendanceCompletedAt: "2026-08-10T01:06:00.000Z",
};

function request(body: unknown) {
  return new NextRequest("http://localhost/api/student/walking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function monthlyAttendance() {
  return {
    month: "2026-08",
    monthDays: 31,
    attendanceCount: 1,
    attendanceDays: [day],
    visitCount: 1,
    claimedOrdinals: [1],
    claimableAttendance: [],
    itemRewardOrdinal: 28,
    itemEarned: false,
    nextOrdinalReward: { ordinal: 2, type: "cash", amount: 10 },
  };
}

describe("POST /api/student/walking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-08-11T03:00:00.000Z"));
    mocks.getCurrentStudent.mockResolvedValue(student);
    mocks.ensureAccountFor.mockResolvedValue({ accountId: "account-1" });
    mocks.retryTransaction.mockImplementation((operation: () => unknown) => operation());
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => unknown) =>
      operation({
        $queryRaw: mocks.txQueryRaw,
        $executeRaw: mocks.txExecuteRaw,
        transaction: { findMany: mocks.transactionFindMany },
      }),
    );
    mocks.txExecuteRaw.mockResolvedValue(1);
    mocks.txQueryRaw.mockResolvedValue([]);
    mocks.transactionFindMany.mockResolvedValue([]);
    mocks.transactionFindFirst.mockResolvedValue(null);
    mocks.queryRaw.mockResolvedValue([syncedRow]);
    mocks.getStudentMonthlyAttendance.mockResolvedValue(monthlyAttendance());
  });

  it("constructs the success DTO only after the transaction commits", async () => {
    const order: string[] = [];
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => unknown) => {
      const result = await operation({
        $queryRaw: mocks.txQueryRaw,
        $executeRaw: mocks.txExecuteRaw,
        transaction: { findMany: mocks.transactionFindMany },
      });
      order.push("commit");
      return result;
    });
    mocks.queryRaw.mockImplementation(async () => {
      order.push("response-read");
      return [syncedRow];
    });

    const response = await POST(request({ rows: [{ day, steps: 12_345, distanceMeters: 4_321.25 }] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(order).toEqual(["commit", "response-read"]);
    expect(body.rows).toHaveLength(1);
  });

  it("constructs the walking response from the persisted snapshot", async () => {
    const response = await POST(request({ rows: [{ day, steps: 12_345, distanceMeters: 4_321.25 }] }));
    const body = await response.json();

    expect(body).toMatchObject({
      rows: [{ day, steps: 12_345, attendanceOrdinal: 1 }],
      syncedDays: [day],
      completedAttendanceDays: [day],
      monthlyAttendanceReward: {
        month: "2026-08",
        eligibleAttendanceDays: [],
        cashEarned: 10,
        cashPaid: 10,
      },
    });
  });

  it("returns the stable unsynced-attendance error DTO", async () => {
    mocks.txQueryRaw.mockResolvedValue([]);

    const response = await POST(request({ attendanceDays: [day] }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "attendance_day_not_synced",
      days: [day],
    });
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("replays an attendance claim without issuing the reward twice", async () => {
    const sourceRef = walkingMonthlyAttendanceSourceRef(student.id, "2026-08", 1);
    mocks.txQueryRaw.mockImplementation(async (query: { strings?: TemplateStringsArray }) => {
      const sql = query.strings?.join("?") ?? "";
      if (sql.includes("FOR UPDATE")) {
        return [{
          day,
          attendanceVisitedAt: "2026-08-10T01:05:00.000Z",
          attendanceOrdinal: 1,
          attendanceCompletedAt: null,
        }];
      }
      return [{ day, attendanceOrdinal: 1, attendanceCompletedAt: "2026-08-10T01:06:00.000Z" }];
    });
    mocks.transactionFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ sourceRef }]);

    const first = await POST(request({ attendanceDays: [day] }));
    const replay = await POST(request({ attendanceDays: [day] }));

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ syncedDays: [day], completedAttendanceDays: [day] });
    expect(mocks.awardActivityReward).toHaveBeenCalledTimes(1);
    expect(mocks.awardActivityReward).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRef }),
    );
  });
});
