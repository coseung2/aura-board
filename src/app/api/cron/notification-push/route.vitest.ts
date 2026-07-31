import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ consume: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notification-outbox", () => ({
  consumeNotificationOutbox: mocks.consume,
}));

import { GET, POST } from "./route";

describe("/api/cron/notification-push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-test";
    mocks.consume.mockResolvedValue({ claimed: 2, processed: 2, retried: 0, dead: 0 });
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

  it("consumes only a bounded outbox batch", async () => {
    const response = await GET(new Request("http://localhost/api/cron/notification-push", {
      headers: { authorization: "Bearer cron-test" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.consume).toHaveBeenCalledWith({ batchSize: 50, concurrency: 5 });
    await expect(response.json()).resolves.toEqual({
      claimed: 2,
      processed: 2,
      retried: 0,
      dead: 0,
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
    expect(mocks.consume).toHaveBeenCalledWith({ batchSize: 50, concurrency: 5 });
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
});
