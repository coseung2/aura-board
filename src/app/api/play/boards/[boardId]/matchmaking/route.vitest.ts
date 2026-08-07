import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  playEngineFetch: vi.fn(),
  announceMatchmaking: vi.fn(),
  boardFindFirst: vi.fn(),
  boardFindUnique: vi.fn(),
  boardCreate: vi.fn(),
  boardDelete: vi.fn(),
  studentFindMany: vi.fn(),
  ticketFindUnique: vi.fn(),
  ticketFindFirst: vi.fn(),
  ticketCount: vi.fn(),
  ticketUpsert: vi.fn(),
  ticketUpdate: vi.fn(),
  ticketUpdateMany: vi.fn(),
  sessionFindFirst: vi.fn(),
  classroomFindUnique: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/play-platform/server-client", () => ({
  playEngineFetch: mocks.playEngineFetch,
}));
vi.mock("@/lib/realtime-broadcast", () => ({
  announceOmokMatchmakingChange: mocks.announceMatchmaking,
}));
vi.mock("@/lib/http-cache", () => ({
  jsonPrivateNoStore: (body: unknown, init?: ResponseInit) => NextResponse.json(body, init),
}));
vi.mock("@/lib/db", () => {
  const db = {
    board: {
      findFirst: mocks.boardFindFirst,
      findUnique: mocks.boardFindUnique,
      create: mocks.boardCreate,
      delete: mocks.boardDelete,
    },
    student: { findMany: mocks.studentFindMany },
    omokMatchTicket: {
      findUnique: mocks.ticketFindUnique,
      findFirst: mocks.ticketFindFirst,
      count: mocks.ticketCount,
      upsert: mocks.ticketUpsert,
      update: mocks.ticketUpdate,
      updateMany: mocks.ticketUpdateMany,
    },
    playSession: { findFirst: mocks.sessionFindFirst },
    classroom: { findUnique: mocks.classroomFindUnique },
    $queryRaw: mocks.queryRaw,
    $transaction: mocks.transaction,
  };
  return { db };
});

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ boardId: "lobby-1" }) };
const request = new Request("http://localhost/api/play/boards/lobby-1/matchmaking");

function postRequest(body?: unknown) {
  return new Request("http://localhost/api/play/boards/lobby-1/matchmaking", {
    method: "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

function engineResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Omok matchmaking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({
      id: "student-2",
      name: "학생 2",
      classroomId: "classroom-1",
    });
    mocks.boardFindFirst.mockResolvedValue({ id: "lobby-1", classroomId: "classroom-1" });
    mocks.boardFindUnique.mockResolvedValue({ slug: "omok-match-room" });
    mocks.boardCreate.mockResolvedValue({ id: "match-board-1" });
    mocks.studentFindMany.mockResolvedValue([
      { id: "student-1", name: "학생 1" },
      { id: "student-2", name: "학생 2" },
    ]);
    mocks.ticketCount.mockResolvedValue(2);
    mocks.ticketUpsert.mockResolvedValue({});
    mocks.ticketUpdate.mockResolvedValue({});
    mocks.ticketUpdateMany.mockResolvedValue({ count: 2 });
    mocks.ticketFindFirst.mockResolvedValue({ id: "ticket-1", studentId: "student-1" });
    mocks.sessionFindFirst.mockResolvedValue({ completedAtMs: null, state: { state: { roomStatus: "active" } } });
    mocks.classroomFindUnique.mockResolvedValue({ teacherId: "teacher-1" });
    mocks.queryRaw.mockResolvedValue([]);
    mocks.announceMatchmaking.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (work: unknown) => {
      if (typeof work === "function") {
        return work({
          board: { create: mocks.boardCreate },
          student: { findMany: mocks.studentFindMany },
          omokMatchTicket: {
            upsert: mocks.ticketUpsert,
            findFirst: mocks.ticketFindFirst,
            update: mocks.ticketUpdate,
          },
          classroom: { findUnique: mocks.classroomFindUnique },
          $queryRaw: mocks.queryRaw,
        });
      }
      return Promise.all(work as Promise<unknown>[]);
    });
  });

  it("requires a signed-in student", async () => {
    mocks.getCurrentStudent.mockResolvedValue(null);
    const response = await GET(request, context);
    expect(response.status).toBe(401);
    expect(mocks.boardFindFirst).not.toHaveBeenCalled();
  });

  it("heartbeats a waiting ticket and returns its live player count", async () => {
    mocks.ticketFindUnique.mockResolvedValue({
      id: "ticket-2",
      status: "waiting",
      matchBoardId: null,
      sessionId: null,
    });
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(mocks.ticketUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "waiting", studentId: "student-2" }),
    }));
    expect(await response.json()).toEqual({ status: "waiting", playerCount: 2 });
  });

  it("pairs two students and starts the authoritative match without requiring teacher request auth", async () => {
    mocks.ticketFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "ticket-2",
        status: "matched",
        matchBoardId: "match-board-1",
        sessionId: "session-1",
      });
    mocks.playEngineFetch
      .mockResolvedValueOnce(engineResponse({ snapshot: { sessionId: "session-1", version: 0 } }, 201))
      .mockResolvedValueOnce(engineResponse({ version: 1 }))
      .mockResolvedValueOnce(engineResponse({ version: 2 }))
      .mockResolvedValueOnce(engineResponse({ version: 3 }));

    const response = await POST(postRequest(), context);

    expect(response.status).toBe(200);
    expect(mocks.studentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { classroomId: "classroom-1", id: { in: ["student-1", "student-2"] } },
    }));
    expect(mocks.playEngineFetch).toHaveBeenCalledTimes(4);
    expect(mocks.playEngineFetch).toHaveBeenLastCalledWith(
      "/v1/sessions/session-1/commands",
      expect.objectContaining({ body: expect.objectContaining({ command: { type: "start" } }) }),
    );
    expect(mocks.announceMatchmaking).toHaveBeenCalledWith("lobby-1");
    expect(await response.json()).toEqual({
      status: "matched",
      playerCount: 2,
      sessionId: "session-1",
      boardSlug: "omok-match-room",
      href: "/board/omok-match-room?view=student",
    });
  });

  it("creates and starts a server-owned computer match immediately", async () => {
    mocks.ticketFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "ticket-2",
        status: "matched",
        matchBoardId: "match-board-1",
        sessionId: "session-bot",
      });
    mocks.ticketCount.mockResolvedValue(1);
    mocks.playEngineFetch
      .mockResolvedValueOnce(engineResponse({ snapshot: { sessionId: "session-bot", version: 0 } }, 201))
      .mockResolvedValueOnce(engineResponse({ version: 1 }))
      .mockResolvedValueOnce(engineResponse({ version: 2 }))
      .mockResolvedValueOnce(engineResponse({ version: 3 }));

    const response = await POST(postRequest({ opponent: "computer" }), context);

    expect(mocks.ticketFindFirst).not.toHaveBeenCalled();
    expect(mocks.ticketUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: "matched", opponentStudentId: null }),
    }));
    expect(mocks.playEngineFetch).toHaveBeenNthCalledWith(
      1,
      "/v1/boards/match-board-1/sessions",
      expect.objectContaining({
        body: expect.objectContaining({
          participants: [
            { actorSubject: "student:student-2", displayName: "학생 2" },
            { actorSubject: "bot:omok:v1", displayName: "오목봇" },
          ],
        }),
      }),
    );
    expect(mocks.playEngineFetch).toHaveBeenNthCalledWith(
      3,
      "/v1/sessions/session-bot/commands",
      expect.objectContaining({
        actor: expect.objectContaining({ subject: "bot:omok:v1", role: "participant" }),
        body: expect.objectContaining({ command: { type: "ready" } }),
      }),
    );
    expect(await response.json()).toEqual({
      status: "matched",
      playerCount: 1,
      sessionId: "session-bot",
      boardSlug: "omok-match-room",
      href: "/board/omok-match-room?view=student",
    });
  });

  it("clears a finished JSON-state match even when completedAtMs was never projected", async () => {
    mocks.ticketFindUnique.mockResolvedValue({
      id: "ticket-2",
      status: "matched",
      matchBoardId: "match-board-1",
      sessionId: "session-1",
    });
    mocks.sessionFindFirst.mockResolvedValue({
      completedAtMs: null,
      state: { state: { roomStatus: "finished" } },
    });
    const response = await GET(request, context);
    expect(await response.json()).toEqual({ status: "idle", playerCount: 0 });
    expect(mocks.ticketUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "ticket-2" },
      data: expect.objectContaining({ status: "idle", matchBoardId: null, sessionId: null }),
    }));
    expect(mocks.announceMatchmaking).toHaveBeenCalledWith("lobby-1");
  });
});
