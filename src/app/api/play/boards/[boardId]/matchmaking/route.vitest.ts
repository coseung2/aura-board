import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  resolveSeeds: vi.fn(),
  playEngineFetch: vi.fn(),
  boardFindFirst: vi.fn(),
  boardFindUnique: vi.fn(),
  boardCreate: vi.fn(),
  boardDelete: vi.fn(),
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
vi.mock("@/lib/play-platform/actor", () => ({
  resolveOmokParticipantSeeds: mocks.resolveSeeds,
}));
vi.mock("@/lib/play-platform/server-client", () => ({
  playEngineFetch: mocks.playEngineFetch,
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
      classroomId: "classroom-1",
    });
    mocks.boardFindFirst.mockResolvedValue({ id: "lobby-1", classroomId: "classroom-1" });
    mocks.boardFindUnique.mockResolvedValue({ slug: "omok-match-room" });
    mocks.boardCreate.mockResolvedValue({ id: "match-board-1" });
    mocks.ticketCount.mockResolvedValue(2);
    mocks.ticketUpsert.mockResolvedValue({});
    mocks.ticketUpdate.mockResolvedValue({});
    mocks.ticketUpdateMany.mockResolvedValue({ count: 2 });
    mocks.ticketFindFirst.mockResolvedValue({ id: "ticket-1", studentId: "student-1" });
    mocks.sessionFindFirst.mockResolvedValue({ completedAtMs: null });
    mocks.classroomFindUnique.mockResolvedValue({ teacherId: "teacher-1" });
    mocks.queryRaw.mockResolvedValue([]);
    mocks.resolveSeeds.mockResolvedValue([
      { actorSubject: "student:student-1", studentId: "student-1", displayName: "학생 1" },
      { actorSubject: "student:student-2", studentId: "student-2", displayName: "학생 2" },
    ]);
    mocks.transaction.mockImplementation(async (work: unknown) => {
      if (typeof work === "function") return work({
        board: { create: mocks.boardCreate },
        omokMatchTicket: {
          upsert: mocks.ticketUpsert,
          findFirst: mocks.ticketFindFirst,
          update: mocks.ticketUpdate,
        },
        classroom: { findUnique: mocks.classroomFindUnique },
        $queryRaw: mocks.queryRaw,
      });
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

  it("pairs two students and starts the authoritative match", async () => {
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

    const response = await POST(request, context);

    expect(response.status).toBe(200);
    expect(mocks.boardCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ layout: "omok", classroomId: "classroom-1" }),
    }));
    expect(mocks.playEngineFetch).toHaveBeenCalledTimes(4);
    expect(mocks.playEngineFetch).toHaveBeenLastCalledWith(
      "/v1/sessions/session-1/commands",
      expect.objectContaining({ body: expect.objectContaining({ command: { type: "start" } }) }),
    );
    expect(await response.json()).toEqual({
      status: "matched",
      playerCount: 2,
      sessionId: "session-1",
      href: "/board/omok-match-room?view=student",
    });
  });

  it("clears a completed match instead of reopening the old board", async () => {
    mocks.ticketFindUnique.mockResolvedValue({
      id: "ticket-2",
      status: "matched",
      matchBoardId: "match-board-1",
      sessionId: "session-1",
    });
    mocks.sessionFindFirst.mockResolvedValue({ completedAtMs: BigInt(1) });
    const response = await GET(request, context);
    expect(await response.json()).toEqual({ status: "idle", playerCount: 0 });
    expect(mocks.ticketUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "ticket-2" },
      data: expect.objectContaining({ status: "idle", matchBoardId: null, sessionId: null }),
    }));
  });
});
