import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { ShadowAllianceSnapshot } from "@/lib/shadow-alliance/contracts";

const mocks = vi.hoisted(() => ({
  findBoard: vi.fn(),
  findStudents: vi.fn(),
  getStudent: vi.fn(),
  getUser: vi.fn(),
  getRole: vi.fn(),
  playEngineFetch: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    board: { findFirst: mocks.findBoard },
    student: { findMany: mocks.findStudents },
  },
}));
vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getStudent }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getUser }));
vi.mock("@/lib/rbac", () => ({ getBoardRole: mocks.getRole }));
vi.mock("@/lib/http-cache", () => ({
  jsonPrivateNoStore: (body: unknown, init?: ResponseInit) =>
    NextResponse.json(body, init),
}));
vi.mock("@/lib/play-platform/server-client", () => {
  class PlayEngineUnavailableError extends Error {}
  return {
    PlayEngineUnavailableError,
    playEngineFetch: mocks.playEngineFetch,
    proxyPlayEngineResponse: async (response: Response) =>
      new Response(await response.arrayBuffer(), {
        status: response.status,
        headers: {
          "content-type": response.headers.get("content-type") ?? "application/json",
          "cache-control": "private, no-store, max-age=0",
        },
      }),
  };
});

import { resetShadowSessionBoardCache } from "@/lib/play-platform/shadow-session-board-cache";
import { GET, PATCH } from "./route";

const snapshot: ShadowAllianceSnapshot = {
  id: "run-1",
  boardId: "board-1",
  classroomId: "class-1",
  version: 3,
  phase: "lobby",
  terminalReason: null,
  round: 0,
  totalRounds: 5,
  command: null,
  editable: true,
  timeLeftMs: 0,
  timerRunning: false,
  startedAt: null,
  completedAt: null,
  participants: [],
  lastResult: null,
  allSubmitted: false,
};

const context = { params: Promise.resolve({ boardId: "board-1" }) };

function jsonResponse(body: unknown, status = 200, replayed = false) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(replayed ? { "x-idempotent-replay": "true" } : {}),
    },
  });
}

function patch(body: unknown) {
  return new Request("http://localhost/api/shadow-alliance/boards/board-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("shadow alliance Rust authority proxy", () => {
  beforeEach(() => {
    resetShadowSessionBoardCache();
    mocks.findBoard.mockReset().mockResolvedValue({
      id: "board-1",
      classroomId: "class-1",
    });
    mocks.findStudents.mockReset().mockResolvedValue([
      { id: "student-1", name: "학생 1" },
      { id: "student-2", name: "학생 2" },
    ]);
    mocks.getStudent.mockReset().mockResolvedValue({
      id: "student-1",
      name: "학생 1",
      classroomId: "class-1",
    });
    mocks.getUser.mockReset().mockResolvedValue(null);
    mocks.getRole.mockReset().mockResolvedValue("owner");
    mocks.playEngineFetch.mockReset();
  });

  it("loads the current authoritative snapshot for a student", async () => {
    mocks.playEngineFetch.mockResolvedValue(jsonResponse(snapshot));
    const response = await GET(
      new Request("http://localhost/api/shadow-alliance/boards/board-1"),
      context,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ snapshot });
    expect(mocks.playEngineFetch).toHaveBeenCalledWith(
      "/v1/boards/board-1/shadow-alliance/sessions/current",
      {
        actor: {
          subject: "student:student-1",
          role: "participant",
          userId: null,
          studentId: "student-1",
        },
      },
    );
  });

  it("reuses a recent authoritative board check for the next command", async () => {
    mocks.playEngineFetch
      .mockResolvedValueOnce(jsonResponse(snapshot))
      .mockResolvedValueOnce(
        jsonResponse({
          snapshot: { ...snapshot, version: 4 },
          previousVersion: 3,
          version: 4,
          resultIds: [],
        }),
      );

    const getResponse = await GET(
      new Request("http://localhost/api/shadow-alliance/boards/board-1"),
      context,
    );
    const patchResponse = await PATCH(
      patch({
        requestId: "shadow-join-cached",
        runId: "run-1",
        expectedVersion: 3,
        action: "join",
      }),
      context,
    );

    expect(getResponse.status).toBe(200);
    expect(patchResponse.status).toBe(200);
    expect(mocks.playEngineFetch).toHaveBeenCalledTimes(2);
    expect(mocks.playEngineFetch).toHaveBeenNthCalledWith(
      2,
      "/v1/shadow-alliance/sessions/run-1/commands",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("allows an authorized host to create the initial Rust session", async () => {
    mocks.getStudent.mockResolvedValue(null);
    mocks.getUser.mockResolvedValue({ id: "teacher-1" });
    mocks.getRole.mockResolvedValue("owner");
    mocks.playEngineFetch
      .mockResolvedValueOnce(jsonResponse({ error: "not_found" }, 404))
      .mockResolvedValueOnce(jsonResponse({ requestId: "create", snapshot }, 201));

    const response = await GET(
      new Request("http://localhost/api/shadow-alliance/boards/board-1"),
      context,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ snapshot, replayed: false });
    expect(mocks.playEngineFetch).toHaveBeenNthCalledWith(
      2,
      "/v1/boards/board-1/shadow-alliance/sessions",
      expect.objectContaining({
        method: "POST",
        body: {
          requestId: "shadow-initial-board-1",
          classroomId: "class-1",
          totalRounds: 5,
          participants: [
            {
              actorSubject: "student:student-1",
              studentId: "student-1",
              displayName: expect.any(String),
            },
            {
              actorSubject: "student:student-2",
              studentId: "student-2",
              displayName: expect.any(String),
            },
          ],
        },
      }),
    );
  });

  it("opens a fresh lobby when a host re-enters an ended session", async () => {
    mocks.getStudent.mockResolvedValue(null);
    mocks.getUser.mockResolvedValue({ id: "teacher-1" });
    mocks.getRole.mockResolvedValue("owner");
    const endedSnapshot = {
      ...snapshot,
      id: "ended-session-1",
      version: 7,
      phase: "host-ended" as const,
      terminalReason: "host_ended",
      completedAt: Date.now(),
    };
    const lobbySnapshot = {
      ...snapshot,
      id: "new-session-1",
      version: 0,
      phase: "lobby" as const,
    };
    mocks.playEngineFetch
      .mockResolvedValueOnce(jsonResponse(endedSnapshot))
      .mockResolvedValueOnce(
        jsonResponse({ requestId: "shadow-reopen-ended-session-1", snapshot: lobbySnapshot }, 201),
      );

    const response = await GET(
      new Request("http://localhost/api/shadow-alliance/boards/board-1"),
      context,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ snapshot: lobbySnapshot, replayed: false });
    expect(mocks.playEngineFetch).toHaveBeenNthCalledWith(
      2,
      "/v1/shadow-alliance/sessions/ended-session-1/rematch",
      expect.objectContaining({
        method: "POST",
        body: { requestId: "shadow-reopen-ended-session-1" },
      }),
    );
  });

  it("rejects legacy participant mutations without the request envelope", async () => {
    const response = await PATCH(patch({ action: "join" }), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_request" });
    expect(mocks.playEngineFetch).not.toHaveBeenCalled();
  });

  it("verifies board ownership then forwards participant intent only", async () => {
    mocks.playEngineFetch
      .mockResolvedValueOnce(jsonResponse(snapshot))
      .mockResolvedValueOnce(
        jsonResponse({
          snapshot: { ...snapshot, version: 4 },
          previousVersion: 3,
          version: 4,
          resultIds: [],
        }),
      );
    const response = await PATCH(
      patch({
        requestId: "shadow-submit-1",
        runId: "run-1",
        expectedVersion: 3,
        action: "submit",
        number: 44,
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.playEngineFetch).toHaveBeenNthCalledWith(
      2,
      "/v1/shadow-alliance/sessions/run-1/commands",
      {
        actor: {
          subject: "student:student-1",
          role: "participant",
          userId: null,
          studentId: "student-1",
        },
        method: "POST",
        body: {
          requestId: "shadow-submit-1",
          expectedVersion: 3,
          commandSchemaVersion: 1,
          command: { type: "submit", number: 44 },
        },
      },
    );
    expect(await response.json()).toMatchObject({ version: 4, replayed: false });
  });

  it("passes through the authoritative conflict snapshot", async () => {
    mocks.playEngineFetch
      .mockResolvedValueOnce(jsonResponse(snapshot))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: "version_conflict",
            currentVersion: 4,
            snapshot: { ...snapshot, version: 4 },
          },
          409,
        ),
      );
    const response = await PATCH(
      patch({
        requestId: "shadow-ready-stale",
        runId: "run-1",
        expectedVersion: 3,
        action: "ready",
      }),
      context,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "version_conflict",
      snapshot: { id: "run-1", version: 4 },
    });
  });

  it("requires owner or editor authority for host commands", async () => {
    mocks.getStudent.mockResolvedValue(null);
    mocks.getUser.mockResolvedValue({ id: "teacher-1" });
    mocks.getRole.mockResolvedValue("viewer");
    const response = await PATCH(
      patch({
        requestId: "shadow-start-1",
        runId: "run-1",
        expectedVersion: 3,
        action: "start",
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.playEngineFetch).not.toHaveBeenCalled();
  });
});
