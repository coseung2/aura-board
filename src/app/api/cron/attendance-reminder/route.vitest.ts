import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findStudents: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { student: { findMany: mocks.findStudents } } }));
vi.mock("@/lib/student-push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/student-push")>()),
  dispatchStudentNotificationPush: mocks.dispatch,
}));

import { GET } from "./route";

describe("GET /api/cron/attendance-reminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T23:00:00.000Z"));
    process.env.CRON_SECRET = "cron-test";
    mocks.findStudents.mockResolvedValue([{ id: "student-1" }]);
    mocks.dispatch.mockResolvedValue({ attempted: 1, skipped: 0 });
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

  it("scans once for the KST day and dispatches an idempotent event key", async () => {
    const response = await GET(new Request("http://localhost", {
      headers: { authorization: "Bearer cron-test" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.findStudents).toHaveBeenCalledWith({
      where: {
        attendances: { none: { day: new Date("2026-08-01T00:00:00.000Z") } },
        notifications: {
          none: {
            eventKey: {
              startsWith: "attendance-missing:",
              endsWith: ":2026-08-01",
            },
          },
        },
      },
      orderBy: { id: "asc" },
      select: { id: true },
      take: 500,
    });
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "attendance-missing:student-1:2026-08-01",
        kind: "attendance",
      }),
      { propagateFailure: true },
    );
  });

  it("exhausts multiple keyset pages without looping or dispatching a student twice", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      id: `student-${String(index + 1).padStart(4, "0")}`,
    }));
    const secondPage = [
      { id: "student-0501" },
      { id: "student-0502" },
    ];
    mocks.findStudents
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);
    mocks.dispatch.mockImplementation(async (input: { studentId: string }) => {
      if (input.studentId === "student-0502") throw new Error("send failed");
      return { attempted: 1, skipped: 0 };
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

    const eventKeys = mocks.dispatch.mock.calls.map(([input]) => input.eventKey);
    expect(eventKeys).toHaveLength(502);
    expect(new Set(eventKeys).size).toBe(502);
    await expect(response.json()).resolves.toEqual({
      day: "2026-08-01",
      scanned: 502,
      dispatched: 501,
      failed: 1,
    });
  });
});
