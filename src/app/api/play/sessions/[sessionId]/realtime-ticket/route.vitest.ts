import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  resolvePlayActor: vi.fn(),
  playEngineFetch: vi.fn(),
  participantFindFirst: vi.fn(),
  issueTransport: vi.fn(),
  realtimeEnabled: vi.fn(),
}));

vi.mock("@/lib/play-platform/actor", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/play-platform/actor")>();
  return { ...original, resolvePlayActor: mocks.resolvePlayActor };
});
vi.mock("@/lib/play-platform/server-client", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/play-platform/server-client")
  >();
  return { ...original, playEngineFetch: mocks.playEngineFetch };
});
vi.mock("@/lib/play-platform/realtime-ticket", () => ({
  issueOmokRealtimeTransport: mocks.issueTransport,
  isOmokRealtimeEnabled: mocks.realtimeEnabled,
}));
vi.mock("@/lib/http-cache", () => ({
  jsonPrivateNoStore: (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set("cache-control", "private, no-store, max-age=0");
    return response;
  },
}));
vi.mock("@/lib/db", () => ({
  db: { playParticipant: { findFirst: mocks.participantFindFirst } },
}));

import { POST } from "./route";

const actor = {
  subject: "student:1",
  role: "participant" as const,
  userId: null,
  studentId: "1",
  classroomId: "classroom-1",
};

function snapshot() {
  return {
    sessionId: "session-1",
    boardId: "board-1",
    gameKind: "omok",
    version: 4,
    serverTimeMs: 1_000,
    rulesVersion: 1,
    stateSchemaVersion: 1,
    previousSessionId: null,
    roomStatus: "active",
    participants: [
      { displayName: "One", slot: "first", ready: true },
      { displayName: "Two", slot: "second", ready: true },
    ],
    viewer: {
      role: "participant",
      slot: "first",
      capabilities: { canRematch: false },
    },
    game: {
      board: Array.from({ length: 225 }, () => null),
      nextTurn: "first",
      status: { status: "playing" },
      moveCount: 0,
      lastMove: null,
    },
    outcome: null,
  };
}

function request() {
  return new Request(
    "http://localhost/api/play/sessions/session-1/realtime-ticket",
    { method: "POST" },
  );
}

const context = { params: Promise.resolve({ sessionId: "session-1" }) };

describe("Omok realtime ticket route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePlayActor.mockResolvedValue(actor);
    mocks.realtimeEnabled.mockReturnValue(true);
    mocks.playEngineFetch.mockResolvedValue(
      new Response(JSON.stringify(snapshot()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mocks.participantFindFirst.mockResolvedValue(null);
    mocks.issueTransport.mockReturnValue({
      transport: "websocket",
      protocolVersion: 1,
      websocketUrl: "wss://play.example/v1/realtime",
      ticket: "opaque-ticket",
      expiresAtMs: 31_000,
    });
  });

  it("proves actor membership through Rust before issuing a human ticket", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(mocks.playEngineFetch).toHaveBeenCalledWith(
      "/v1/sessions/session-1/snapshot",
      { actor },
    );
    expect(mocks.playEngineFetch.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.issueTransport.mock.invocationCallOrder[0],
    );
    expect(mocks.issueTransport).toHaveBeenCalledWith(actor, "session-1");
    expect(await response.json()).toMatchObject({
      transport: "websocket",
      ticket: "opaque-ticket",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("returns authenticated HTTP fallback for bot sessions without ticket or URL", async () => {
    mocks.participantFindFirst.mockResolvedValue({ id: "bot-participant" });
    const response = await POST(request(), context);
    expect(await response.json()).toEqual({
      transport: "http",
      reason: "bot_session",
      pollIntervalMs: 3000,
    });
    expect(mocks.issueTransport).not.toHaveBeenCalled();
  });

  it("forwards membership denial and does not query or issue transport", async () => {
    mocks.playEngineFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    const response = await POST(request(), context);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(mocks.participantFindFirst).not.toHaveBeenCalled();
    expect(mocks.issueTransport).not.toHaveBeenCalled();
  });

  it("rejects an invalid authority snapshot without leaking actor identity", async () => {
    mocks.playEngineFetch.mockResolvedValue(
      new Response(JSON.stringify({ sessionId: "other-session" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const response = await POST(request(), context);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "play_engine_unavailable" });
    expect(mocks.issueTransport).not.toHaveBeenCalled();
  });

  it("returns 503 without actor or authority work when realtime is disabled", async () => {
    mocks.realtimeEnabled.mockReturnValue(false);
    const response = await POST(request(), context);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "realtime_disabled" });
    expect(mocks.resolvePlayActor).not.toHaveBeenCalled();
    expect(mocks.playEngineFetch).not.toHaveBeenCalled();
    expect(mocks.participantFindFirst).not.toHaveBeenCalled();
    expect(mocks.issueTransport).not.toHaveBeenCalled();
  });
});
