import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  morning: vi.fn(),
  afternoon: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notification-outbox", () => ({
  consumeNotificationOutbox: mocks.consume,
}));
vi.mock("../attendance-reminder/route", () => ({
  runMorningAttendanceReminder: mocks.morning,
}));
vi.mock("../afternoon-attendance-reminder/route", () => ({
  runAfternoonAttendanceReminder: mocks.afternoon,
}));

import { GET, POST } from "./route";

describe("/api/cron/notification-push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-test";
    mocks.consume.mockResolvedValue({ claimed: 2, processed: 2, retried: 0, dead: 0 });
    mocks.morning.mockResolvedValue({ dispatched: 1, attemptedDevices: 1, failed: 0 });
    mocks.afternoon.mockResolvedValue({ dispatched: 1, attemptedDevices: 1, failed: 0 });
  });

  afterEach(() => { delete process.env.CRON_SECRET; });

  it.each([
    [undefined, "Bearer cron-test"],
    ["cron-test", null],
    ["cron-test", "Basic cron-test"],
    ["cron-test", "Bearer wrong"],
  ])("rejects unauthorized requests before claiming work", async (secret, authorization) => {
    if (secret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = secret;
    const headers = authorization ? { authorization } : {};

    const response = await GET(new Request("http://localhost/api/cron/notification-push", { headers }));

    expect(response.status).toBe(401);
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("drains a bounded 100-row outbox batch", async () => {
    const response = await GET(new Request("http://localhost/api/cron/notification-push", {
      headers: { authorization: "Bearer cron-test" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.consume).toHaveBeenCalledWith({ batchSize: 100, concurrency: 5 });
    await expect(response.json()).resolves.toEqual({
      batches: 1,
      claimed: 2,
      processed: 2,
      retried: 0,
      dead: 0,
      hasMore: false,
      attendanceSlot: null,
      attendance: null,
    });
  });

  it("continues draining while a full batch is claimed", async () => {
    mocks.consume
      .mockResolvedValueOnce({ claimed: 100, processed: 98, retried: 2, dead: 0 })
      .mockResolvedValueOnce({ claimed: 3, processed: 3, retried: 0, dead: 0 });

    const response = await GET(new Request("http://localhost/api/cron/notification-push", {
      headers: { authorization: "Bearer cron-test" },
    }));

    expect(mocks.consume).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toEqual({
      batches: 2,
      claimed: 103,
      processed: 101,
      retried: 2,
      dead: 0,
      hasMore: false,
      attendanceSlot: null,
      attendance: null,
    });
  });

  it("accepts the same authenticated contract from a POST database webhook", async () => {
    const response = await POST(new Request("http://localhost/api/cron/notification-push", {
      method: "POST",
      headers: {
        authorization: "Bearer cron-test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ reason: "notification_outbox_insert" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.consume).toHaveBeenCalledWith({ batchSize: 100, concurrency: 5 });
  });

  it("rejects an unauthenticated POST database webhook", async () => {
    const response = await POST(new Request("http://localhost/api/cron/notification-push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "notification_outbox_insert" }),
    }));

    expect(response.status).toBe(401);
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-09-01T22:50:00.000Z", "morning", "morning"],
    ["2026-09-01T08:00:00.000Z", "afternoon", "afternoon"],
  ])("runs the %s KST attendance slot from the minute poller", async (iso, slot, mockName) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
    const response = await GET(new Request("http://localhost/api/cron/notification-push", {
      headers: { authorization: "Bearer cron-test" },
    }));
    const expectedMock = mockName === "morning" ? mocks.morning : mocks.afternoon;
    expect(expectedMock).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({ attendanceSlot: slot });
    vi.useRealTimers();
  });
});
