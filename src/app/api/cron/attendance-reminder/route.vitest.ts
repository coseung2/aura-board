import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findStudents: vi.fn(),
  dispatchBatch: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { student: { findMany: mocks.findStudents } } }));
vi.mock("@/lib/student-push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/student-push")>()),
  dispatchStudentNotificationPushBatch: mocks.dispatchBatch,
}));

import { GET } from "./route";

describe("GET /api/cron/attendance-reminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T23:00:00.000Z"));
    process.env.CRON_SECRET = "cron-test";
    mocks.findStudents.mockResolvedValue([{ id: "student-1", assignmentSlots: [] }]);
    mocks.dispatchBatch.mockResolvedValue({ attempted: 1, skipped: 0, reserved: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CRON_SECRET;
  });

  it("rejects unauthorized scans", async () => {
    const response = await GET(new Request("http://localhost", {
      headers: { authorization: "Bearer wrong" },
    }));
    expect(response.status).toBe(401);
    expect(mocks.findStudents).not.toHaveBeenCalled();
  });

  it("scans once for the KST day and sends one morning task digest batch", async () => {
    mocks.findStudents.mockResolvedValueOnce([{
      id: "student-1",
      assignmentSlots: [{
        dueAt: new Date("2026-08-01T07:00:00.000Z"),
        board: { title: "과학 관찰 기록", slug: "science" },
      }],
    }]);

    const response = await GET(new Request("http://localhost", {
      headers: { authorization: "Bearer cron-test" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.findStudents).toHaveBeenCalledWith({
      where: {
        attendances: { none: { day: new Date("2026-08-01T00:00:00.000Z") } },
        pushDispatches: {
          none: {
            eventKey: {
              startsWith: "morning-tasks:",
              endsWith: ":2026-08-01",
            },
          },
        },
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        assignmentSlots: {
          where: {
            submissionStatus: { in: ["assigned", "returned", "orphaned"] },
          },
          orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
          select: {
            dueAt: true,
            board: { select: { title: true, slug: true } },
          },
        },
      },
      take: 500,
    });
    expect(mocks.dispatchBatch).toHaveBeenCalledWith(
      [expect.objectContaining({
        eventKey: "morning-tasks:student-1:2026-08-01",
        kind: "attendance",
        body: expect.stringContaining(
          "과학 관찰 기록 과제의 마감이 오늘 오후 4시까지예요.",
        ),
      })],
      { propagateFailure: true },
    );
    await expect(response.json()).resolves.toEqual({
      day: "2026-08-01",
      scanned: 1,
      dispatched: 1,
      attemptedDevices: 1,
      failed: 0,
    });
  });

  it("exhausts multiple keyset pages in 100-student push batches", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      id: `student-${String(index + 1).padStart(4, "0")}`,
      assignmentSlots: [],
    }));
    const secondPage = [
      { id: "student-0501", assignmentSlots: [] },
      { id: "student-0502", assignmentSlots: [] },
    ];
    mocks.findStudents
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);
    mocks.dispatchBatch.mockImplementation(async (batch: Array<{ studentId: string }>) => {
      if (batch[0]?.studentId === "student-0501") throw new Error("send failed");
      return { attempted: batch.length, skipped: 0, reserved: batch.length };
    });

    const response = await GET(new Request("http://localhost", {
      headers: { authorization: "Bearer cron-test" },
    }));

    expect(mocks.findStudents).toHaveBeenCalledTimes(2);
    expect(mocks.findStudents.mock.calls[0][0].where).not.toHaveProperty("id");
    expect(mocks.findStudents.mock.calls[1][0]).toMatchObject({
      where: { id: { gt: "student-0500" } },
      orderBy: { id: "asc" },
      take: 500,
    });
    expect(mocks.dispatchBatch).toHaveBeenCalledTimes(6);
    const firstPageBatches = mocks.dispatchBatch.mock.calls.slice(0, 5)
      .flatMap(([batch]) => batch as Array<{ eventKey: string }>);
    expect(mocks.dispatchBatch.mock.calls.slice(0, 5).every(([batch]) => batch.length === 100))
      .toBe(true);
    expect(firstPageBatches).toHaveLength(500);
    expect(new Set(firstPageBatches.map((item) => item.eventKey)).size).toBe(500);
    await expect(response.json()).resolves.toEqual({
      day: "2026-08-01",
      scanned: 502,
      dispatched: 500,
      attemptedDevices: 500,
      failed: 2,
    });
  });
});
