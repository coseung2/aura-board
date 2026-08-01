import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockRoleSalaryPayoutError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = "RoleSalaryPayoutError";
    }
  }

  return {
    findMany: vi.fn(),
    isAuthorizedCronRequest: vi.fn(),
    payClassroomRoleSalaries: vi.fn(),
    RoleSalaryPayoutError: MockRoleSalaryPayoutError,
  };
});

vi.mock("@/lib/db", () => ({
  db: { classroomRolePayPolicy: { findMany: mocks.findMany } },
}));
vi.mock("@/lib/cron-auth", () => ({
  isAuthorizedCronRequest: mocks.isAuthorizedCronRequest,
}));
vi.mock("@/lib/role-salary-payout", () => ({
  payClassroomRoleSalaries: mocks.payClassroomRoleSalaries,
  RoleSalaryPayoutError: mocks.RoleSalaryPayoutError,
}));

import { GET } from "./route";

type Policy = {
  id: string;
  classroomId: string;
  payMode: string;
  payPeriod: string;
  payAnchor: number | null;
  classroom: { teacherId: string };
};

function policy(
  id: string,
  payPeriod: string,
  payAnchor: number | null,
): Policy {
  return {
    id,
    classroomId: `classroom-${id}`,
    payMode: "auto",
    payPeriod,
    payAnchor,
    classroom: { teacherId: `teacher-${id}` },
  };
}

function request() {
  return new Request("https://aura-board.example/api/cron/role-salary-payout", {
    headers: { authorization: "Bearer test-secret" },
  });
}

function scopedRequest(classroomId: string) {
  return new Request(
    `https://aura-board.example/api/cron/role-salary-payout?classroomId=${encodeURIComponent(classroomId)}`,
    { headers: { authorization: "Bearer test-secret" } },
  );
}

describe("GET /api/cron/role-salary-payout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.isAuthorizedCronRequest.mockReturnValue(true);
    mocks.findMany.mockResolvedValue([]);
    mocks.payClassroomRoleSalaries.mockResolvedValue({
      paidRoles: 1,
      paidStudents: 1,
      totalAmount: 100,
    });
  });

  it("rejects unauthorized requests before querying policies", async () => {
    mocks.isAuthorizedCronRequest.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid classroom scope before querying policies", async () => {
    const response = await GET(scopedRequest("../all"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_classroom_id" });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("limits a live verification sweep to one classroom", async () => {
    mocks.findMany.mockResolvedValueOnce([policy("01", "daily", null)]);

    const response = await GET(scopedRequest("classroom-01"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ classroomId: "classroom-01", paid: 1 });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { payMode: "auto", classroomId: "classroom-01" },
      }),
    );
  });

  it("pays daily policies using the KST calendar date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T16:30:00.000Z")); // Aug 2 in KST
    mocks.findMany.mockResolvedValueOnce([policy("01", "daily", null)]);

    const response = await GET(request());

    expect(await response.json()).toMatchObject({
      ok: true,
      scanned: 1,
      due: 1,
      paid: 1,
      paidRoles: 1,
      paidStudents: 1,
      totalAmount: 100,
      skipped: 0,
      failed: 0,
    });
    expect(mocks.payClassroomRoleSalaries).toHaveBeenCalledWith({
      classroomId: "classroom-01",
      performedById: "teacher-01",
      requestKey: "role-salary:auto:daily:2026-08-02",
    });
  });

  it("uses Monday-based weekly buckets and only pays on the configured weekday", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T15:30:00.000Z")); // Monday in KST
    mocks.findMany.mockResolvedValueOnce([
      policy("01", "weekly", 1),
      policy("02", "weekly", 7),
    ]);

    const response = await GET(request());

    expect(await response.json()).toMatchObject({
      scanned: 2,
      due: 1,
      paid: 1,
      skipped: 1,
      failed: 0,
    });
    expect(mocks.payClassroomRoleSalaries).toHaveBeenCalledTimes(1);
    expect(mocks.payClassroomRoleSalaries).toHaveBeenCalledWith(
      expect.objectContaining({
        classroomId: "classroom-01",
        requestKey: "role-salary:auto:weekly:2026-08-03",
      }),
    );
  });

  it("pays a monthly day-31 policy on the last day of a short month", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T15:30:00.000Z")); // Feb 28 in KST
    mocks.findMany.mockResolvedValueOnce([policy("01", "monthly", 31)]);

    await GET(request());

    expect(mocks.payClassroomRoleSalaries).toHaveBeenCalledWith(
      expect.objectContaining({
        requestKey: "role-salary:auto:monthly:2026-02",
      }),
    );
  });

  it("counts replays and empty classrooms as skips", async () => {
    mocks.findMany.mockResolvedValueOnce([
      policy("01", "daily", null),
      policy("02", "daily", null),
    ]);
    mocks.payClassroomRoleSalaries
      .mockRejectedValueOnce(
        new mocks.RoleSalaryPayoutError("already_applied"),
      )
      .mockRejectedValueOnce(new mocks.RoleSalaryPayoutError("no_assignees"));

    const response = await GET(request());

    expect(await response.json()).toMatchObject({
      ok: true,
      scanned: 2,
      due: 2,
      paid: 0,
      skipped: 2,
      failed: 0,
    });
  });

  it("keeps the weekly idempotency key stable when its anchor changes", async () => {
    vi.useFakeTimers();
    const seenKeys = new Set<string>();
    mocks.findMany.mockResolvedValue([policy("01", "weekly", 1)]);
    mocks.payClassroomRoleSalaries.mockImplementation(
      async ({ requestKey }: { requestKey: string }) => {
        if (seenKeys.has(requestKey)) {
          throw new mocks.RoleSalaryPayoutError("already_applied");
        }
        seenKeys.add(requestKey);
        return { paidRoles: 1, paidStudents: 1, totalAmount: 100 };
      },
    );

    vi.setSystemTime(new Date("2026-08-02T15:30:00.000Z")); // Monday in KST
    const firstResponse = await GET(request());

    mocks.findMany.mockResolvedValue([policy("01", "weekly", 2)]);
    vi.setSystemTime(new Date("2026-08-03T15:30:00.000Z")); // Tuesday in KST
    const replayResponse = await GET(request());

    expect(await firstResponse.json()).toMatchObject({ paid: 1, skipped: 0 });
    expect(await replayResponse.json()).toMatchObject({ paid: 0, skipped: 1 });
    expect([...seenKeys]).toEqual(["role-salary:auto:weekly:2026-08-03"]);
  });

  it("continues after an unexpected per-class failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findMany.mockResolvedValueOnce([
      policy("01", "daily", null),
      policy("02", "daily", null),
    ]);
    mocks.payClassroomRoleSalaries
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ paidRoles: 1, paidStudents: 1, totalAmount: 100 });

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      ok: false,
      scanned: 2,
      due: 2,
      paid: 1,
      skipped: 0,
      failed: 1,
    });
    expect(mocks.payClassroomRoleSalaries).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith(
      "[role-salary-payout] classroom payout failed",
      expect.objectContaining({ classroomId: "classroom-01" }),
    );
    consoleError.mockRestore();
  });

  it("scans auto policies in bounded keyset pages", async () => {
    const policies = Array.from({ length: 101 }, (_, index) =>
      policy(String(index + 1).padStart(3, "0"), "daily", null),
    );
    mocks.findMany.mockImplementation(
      async ({ where, take }: { where: { id?: { gt: string } }; take: number }) => {
        const after = where.id?.gt;
        const start = after
          ? policies.findIndex((item) => item.id === after) + 1
          : 0;
        return policies.slice(start, start + take);
      },
    );

    const response = await GET(request());

    expect(await response.json()).toMatchObject({
      scanned: 101,
      due: 101,
      paid: 101,
      failed: 0,
    });
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
    expect(mocks.findMany.mock.calls[0][0]).toMatchObject({
      where: { payMode: "auto" },
      orderBy: { id: "asc" },
      take: 100,
    });
    expect(mocks.findMany.mock.calls[1][0]).toMatchObject({
      where: { payMode: "auto", id: { gt: "100" } },
    });
  });
});
