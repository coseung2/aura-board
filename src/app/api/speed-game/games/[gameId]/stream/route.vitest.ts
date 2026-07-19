import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  speedGameFindUnique: vi.fn(),
  authenticateGameViewer: vi.fn(),
  loadGameSnapshot: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    speedGame: {
      findUnique: mocks.speedGameFindUnique,
    },
  },
}));
vi.mock("@/lib/speed-game/runtime", () => ({
  authenticateGameViewer: mocks.authenticateGameViewer,
  loadGameSnapshot: mocks.loadGameSnapshot,
}));

import { GET } from "./route";

const initialSnapshot = {
  id: "game-1",
  boardId: "board-1",
  boardSlug: "board",
  classroomId: "classroom-1",
  status: "active" as const,
  roundIndex: 0,
  answerMode: "exact" as const,
  baseScore: 1000,
  minScore: 0,
  bonusRanks: [300, 200, 100],
  timeLimitMs: 0,
  rounds: [],
  answers: [],
  groups: [],
  leaderboard: [],
};

const changedSnapshot = {
  ...initialSnapshot,
  answers: [
    {
      id: "answer-1",
      roundId: "round-1",
      groupId: "group-1",
      studentId: "student-1",
      answer: "Cat",
      correct: true,
      rank: 1,
      score: 1000,
      elapsedMs: 250,
      createdAt: "2026-07-20T00:00:02.000Z",
    },
  ],
};

function decode(chunk: Uint8Array | undefined) {
  return chunk ? new TextDecoder().decode(chunk) : "";
}

describe("GET /api/speed-game/games/[gameId]/stream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.clearAllMocks();
    mocks.authenticateGameViewer.mockResolvedValue({
      kind: "teacher",
      userId: "teacher-1",
      role: "owner",
    });
    mocks.loadGameSnapshot
      .mockResolvedValueOnce(initialSnapshot)
      .mockResolvedValueOnce(changedSnapshot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("sends the initial snapshot, probes cheaply when unchanged, and hydrates on change", async () => {
    const probeUpdatedAt = [new Date(0), new Date(1_000)];
    let probeIndex = 0;
    mocks.speedGameFindUnique.mockImplementation(({ select }: { select: Record<string, boolean> }) => {
      if (select.boardId) {
        return Promise.resolve({ boardId: "board-1", updatedAt: new Date(0) });
      }
      const updatedAt = probeUpdatedAt[Math.min(probeIndex++, probeUpdatedAt.length - 1)];
      return Promise.resolve({ updatedAt, status: "running" });
    });

    const response = await GET(_request(), {
      params: Promise.resolve({ gameId: "game-1" }),
    });
    const reader = response.body!.getReader();

    const first = await reader.read();
    expect(decode(first.value)).toContain('event: snapshot\ndata: {"game":');
    expect(mocks.loadGameSnapshot).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(mocks.speedGameFindUnique).toHaveBeenCalledTimes(2);
    expect(mocks.loadGameSnapshot).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(mocks.speedGameFindUnique).toHaveBeenCalledTimes(3);
    expect(mocks.loadGameSnapshot).toHaveBeenCalledTimes(2);
    const changed = await reader.read();
    expect(decode(changed.value)).toContain('"answer-1"');

    await reader.cancel();
  });

  it("emits an SSE keepalive comment after roughly 25 seconds", async () => {
    let probeUpdatedAt = new Date(0);
    mocks.speedGameFindUnique.mockImplementation(({ select }: { select: Record<string, boolean> }) => {
      if (select.boardId) {
        return Promise.resolve({ boardId: "board-1", updatedAt: probeUpdatedAt });
      }
      return Promise.resolve({ updatedAt: probeUpdatedAt, status: "running" });
    });

    const response = await GET(_request(), {
      params: Promise.resolve({ gameId: "game-1" }),
    });
    const reader = response.body!.getReader();
    await reader.read();

    // Poll ticks land at 3s boundaries, so the first tick after the 25s
    // threshold is approximately 27s (with the test's zero jitter).
    await vi.advanceTimersByTimeAsync(28_000);
    const keepalive = await reader.read();
    expect(decode(keepalive.value)).toContain(": ping\n\n");

    await reader.cancel();
  });

  it("retries hydration when a changed snapshot read fails transiently", async () => {
    mocks.speedGameFindUnique.mockImplementation(
      ({ select }: { select: Record<string, boolean> }) => {
        if (select.boardId) {
          return Promise.resolve({ boardId: "board-1", updatedAt: new Date(0) });
        }
        return Promise.resolve({ updatedAt: new Date(1_000), status: "running" });
      },
    );
    mocks.loadGameSnapshot
      .mockReset()
      .mockResolvedValueOnce(initialSnapshot)
      .mockRejectedValueOnce(new Error("temporary snapshot failure"))
      .mockResolvedValueOnce(changedSnapshot);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(_request(), {
      params: Promise.resolve({ gameId: "game-1" }),
    });
    const reader = response.body!.getReader();
    await reader.read();

    await vi.advanceTimersByTimeAsync(3_000);
    expect(mocks.loadGameSnapshot).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(mocks.loadGameSnapshot).toHaveBeenCalledTimes(3);
    const changed = await reader.read();
    expect(decode(changed.value)).toContain('"answer-1"');
    expect(consoleError).toHaveBeenCalled();

    await reader.cancel();
  });

  it("recovers when the initial snapshot read fails transiently", async () => {
    mocks.speedGameFindUnique.mockImplementation(
      ({ select }: { select: Record<string, boolean> }) => {
        if (select.boardId) {
          return Promise.resolve({ boardId: "board-1", updatedAt: new Date(0) });
        }
        return Promise.resolve({ updatedAt: new Date(1_000), status: "running" });
      },
    );
    mocks.loadGameSnapshot
      .mockReset()
      .mockRejectedValueOnce(new Error("temporary initial failure"))
      .mockResolvedValueOnce(changedSnapshot);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(_request(), {
      params: Promise.resolve({ gameId: "game-1" }),
    });
    const reader = response.body!.getReader();

    await vi.advanceTimersByTimeAsync(3_000);
    const recovered = await reader.read();
    expect(decode(recovered.value)).toContain('"answer-1"');
    expect(mocks.loadGameSnapshot).toHaveBeenCalledTimes(2);

    await reader.cancel();
  });
});

function _request() {
  return new Request("https://example.test/api/speed-game/games/game-1/stream");
}
