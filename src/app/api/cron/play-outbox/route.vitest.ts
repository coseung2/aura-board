import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorized: vi.fn(),
  internalFetch: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cron-auth", () => ({
  isAuthorizedCronRequest: mocks.authorized,
}));
vi.mock("@/lib/play-platform/server-client", () => ({
  playEngineInternalFetch: mocks.internalFetch,
  PlayEngineUnavailableError: class PlayEngineUnavailableError extends Error {},
}));
vi.mock("@/lib/realtime-broadcast", () => ({
  publishPlaySessionInvalidation: mocks.publish,
}));
vi.mock("@/lib/play-platform/route-utils", () => ({
  playRouteError: () => Response.json({ error: "internal_error" }, { status: 500 }),
}));

import { GET } from "./route";

function event(id: string, lockToken: string) {
  return {
    id,
    sessionId: "session-1",
    boardId: "board-1",
    version: 4,
    eventType: "session_changed",
    attempts: 1,
    lockToken,
  };
}

describe("/api/cron/play-outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorized.mockReturnValue(true);
  });

  it("rejects unauthorized requests before claiming rows", async () => {
    mocks.authorized.mockReturnValue(false);

    const response = await GET(new Request("http://localhost/api/cron/play-outbox"));

    expect(response.status).toBe(401);
    expect(mocks.internalFetch).not.toHaveBeenCalled();
  });

  it("acknowledges only delivered rows with their claim lock token", async () => {
    mocks.internalFetch.mockImplementation(async (path: string) => {
      if (path.includes("/claim")) {
        return Response.json({
          events: [event("event-1", "lease-a"), event("event-2", "lease-a"), event("event-3", "lease-b")],
        });
      }
      return Response.json({ ok: true });
    });
    mocks.publish.mockImplementation(async (payload: { eventId: string }) => {
      if (payload.eventId === "event-3") throw new Error("broadcast failed");
    });

    const response = await GET(new Request("http://localhost/api/cron/play-outbox"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      claimed: 3,
      delivered: 2,
      pendingRetry: 1,
    });
    expect(mocks.internalFetch).toHaveBeenCalledWith(
      "/v1/internal/outbox/complete",
      { body: { ids: ["event-1", "event-2"], lockToken: "lease-a" } },
    );
    expect(mocks.internalFetch).toHaveBeenCalledTimes(2);
  });
});
