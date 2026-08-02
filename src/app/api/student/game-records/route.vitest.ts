import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudentRaw: vi.fn(),
  findMany: vi.fn(),
  groupBy: vi.fn(),
  aggregate: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudentRaw: mocks.getCurrentStudentRaw,
}));
vi.mock("@/lib/db", () => ({
  db: {
    gameResult: {
      findMany: mocks.findMany,
      groupBy: mocks.groupBy,
      aggregate: mocks.aggregate,
    },
  },
}));

import { GET } from "./route";

function request(query = "") {
  return new Request(`http://localhost/api/student/game-records${query}`);
}

function row(id: string, completedAt: string) {
  return {
    id,
    gameKind: "omok",
    boardId: "board-1",
    classroomId: "classroom-1",
    studentId: "student-self",
    sourceType: "play_session",
    sourceId: `session-${id}`,
    outcome: "win",
    score: BigInt(100),
    durationMs: BigInt(20_000),
    metrics: { side: "black", moveCount: 21, reason: "five" },
    startedAt: new Date("2026-08-01T00:00:00.000Z"),
    completedAt: new Date(completedAt),
    idempotencyKey: `omok:${id}:student-self`,
    rulesVersion: 1,
    stateSchemaVersion: 1,
    createdAt: new Date(completedAt),
    board: { title: "우리 반 오목" },
  };
}

describe("GET /api/student/game-records", () => {
  beforeEach(() => {
    mocks.getCurrentStudentRaw.mockReset();
    mocks.findMany.mockReset();
    mocks.groupBy.mockReset();
    mocks.aggregate.mockReset();
    mocks.getCurrentStudentRaw.mockResolvedValue({
      id: "student-self",
      classroomId: "classroom-1",
    });
    mocks.groupBy
      .mockResolvedValueOnce([{ gameKind: "omok", _count: { _all: 2 } }])
      .mockResolvedValueOnce([{ outcome: "win", _count: { _all: 2 } }]);
    mocks.aggregate.mockResolvedValue({
      _count: { _all: 2 },
      _max: {
        score: BigInt(100),
        completedAt: new Date("2026-08-02T03:00:00.000Z"),
      },
    });
  });

  it("rejects unauthenticated callers before querying results", async () => {
    mocks.getCurrentStudentRaw.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("rejects non-official filters and forged studentId queries", async () => {
    const response = await GET(request("?gameKind=quiz"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_game_kind" });
    expect(mocks.findMany).not.toHaveBeenCalled();

    const forged = await GET(request("?studentId=student-other"));
    expect(forged.status).toBe(400);
    expect(await forged.json()).toEqual({
      error: "unknown_query",
      key: "studentId",
    });
  });

  it("returns only the authenticated student's deterministic page", async () => {
    mocks.findMany.mockResolvedValue([
      row("result-3", "2026-08-02T03:00:00.000Z"),
      row("result-2", "2026-08-02T02:00:00.000Z"),
      row("result-1", "2026-08-02T01:00:00.000Z"),
    ]);

    const response = await GET(request("?gameKind=omok&range=all&limit=2"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.records).toHaveLength(2);
    expect(body.records[0]).toMatchObject({
      id: "result-3",
      gameKind: "omok",
      boardTitle: "우리 반 오목",
      score: 100,
      durationMs: 20_000,
    });
    expect(body.nextCursor).toEqual(expect.any(String));
    expect(body.summary).toEqual({
      totalPlays: 2,
      completedCount: 2,
      bestScore: 100,
      latestCompletedAt: "2026-08-02T03:00:00.000Z",
    });
    expect(body.appliedFilter).toEqual({
      gameKind: "omok",
      range: "all",
      limit: 2,
    });
    expect(body.facets).toEqual({ omok: 2 });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: "student-self",
          gameKind: "omok",
        }),
        orderBy: [{ completedAt: "desc" }, { id: "desc" }],
        take: 3,
      }),
    );
    const serialized = JSON.stringify(mocks.findMany.mock.calls[0][0]);
    expect(serialized).not.toContain("student-other");
  });
});
