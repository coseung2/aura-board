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

describe("GET /api/cron/afternoon-attendance-reminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T08:00:00.000Z"));
    process.env.CRON_SECRET = "cron-test";
    mocks.findStudents.mockResolvedValue([{
      id: "student-1",
      assignmentSlots: [{
        dueAt: new Date("2026-08-01T07:00:00.000Z"),
        board: { title: "과학 관찰 기록", slug: "science" },
      }],
    }]);
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

  it("targets only students without today's attendance and sends an afternoon digest", async () => {
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
              startsWith: "afternoon-tasks:",
              endsWith: ":2026-08-01",
            },
          },
        },
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        assignmentSlots: {
          where: { submissionStatus: { in: ["assigned", "returned", "orphaned"] } },
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
        eventKey: "afternoon-tasks:student-1:2026-08-01",
        kind: "attendance",
        href: "/student",
        body: expect.stringContaining("출석 보상을 받을 수 있어요."),
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

  it("continues keyset pages and accounts for failed 100-student batches", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      id: `student-${String(index + 1).padStart(4, "0")}`,
      assignmentSlots: [],
    }));
    mocks.findStudents
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([{ id: "student-0501", assignmentSlots: [] }]);
    mocks.dispatchBatch.mockImplementation(async (batch: Array<{ studentId: string }>) => {
      if (batch[0]?.studentId === "student-0501") throw new Error("send failed");
      return { attempted: batch.length, skipped: 0, reserved: batch.length };
    });

    const response = await GET(new Request("http://localhost", {
      headers: { authorization: "Bearer cron-test" },
    }));

    expect(mocks.findStudents).toHaveBeenCalledTimes(2);
    expect(mocks.findStudents.mock.calls[1][0]).toMatchObject({
      where: { id: { gt: "student-0500" } },
      orderBy: { id: "asc" },
      take: 500,
    });
    expect(mocks.dispatchBatch).toHaveBeenCalledTimes(6);
    await expect(response.json()).resolves.toEqual({
      day: "2026-08-01",
      scanned: 501,
      dispatched: 500,
      attemptedDevices: 500,
      failed: 1,
    });
  });
});
