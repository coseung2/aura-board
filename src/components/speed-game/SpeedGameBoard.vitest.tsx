import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpeedGameWire } from "./types";

const realtime = vi.hoisted(() => ({
  broadcast: null as null | (() => void),
  status: null as null | ((status: string) => void),
  removeChannel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/client", () => ({
  createIsolatedPublicSupabaseClient: () => {
    const channel = {
      on: vi.fn((_kind, _filter, callback: () => void) => {
        realtime.broadcast = callback;
        return channel;
      }),
      subscribe: vi.fn((callback: (status: string) => void) => {
        realtime.status = callback;
        return channel;
      }),
    };
    return {
      channel: vi.fn(() => channel),
      removeChannel: realtime.removeChannel,
    };
  },
}));

vi.mock("@/components/PlayBoardContinueButton", () => ({
  PlayBoardContinueButton: () => null,
}));

import { SpeedGameBoard } from "./SpeedGameBoard";

const game: SpeedGameWire = {
  id: "game-1",
  boardId: "board-1",
  boardSlug: "speed",
  classroomId: "classroom-1",
  status: "waiting",
  roundIndex: -1,
  answerMode: "exact",
  baseScore: 1000,
  minScore: 0,
  bonusRanks: [],
  timeLimitMs: 30_000,
  rounds: [],
  answers: [],
  groups: [],
  leaderboard: [],
};

function renderBoard(initialGame: SpeedGameWire = game) {
  return render(
    <SpeedGameBoard
      boardId="board-1"
      boardSlug="speed"
      classroomId="classroom-1"
      viewerKind="teacher"
      currentStudentId={null}
      initialGame={initialGame}
    />,
  );
}

describe("SpeedGameBoard realtime transport", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    realtime.broadcast = null;
    realtime.status = null;
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ game }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refetches the authoritative GET snapshot on Broadcast invalidation", async () => {
    renderBoard();
    await waitFor(() => expect(realtime.status).toBeTypeOf("function"));

    await act(async () => realtime.status?.("SUBSCRIBED"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();

    await act(async () => realtime.broadcast?.());

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/speed-game/games/game-1", {
        cache: "no-store",
      }),
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows and schedules polling fallback only after channel failure", async () => {
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    renderBoard();
    await waitFor(() => expect(realtime.status).toBeTypeOf("function"));
    expect(setTimeoutSpy.mock.calls.some(([, delay]) => delay === 15_000)).toBe(false);

    await act(async () => realtime.status?.("CHANNEL_ERROR"));

    expect(screen.getByRole("status").textContent).toContain("다시 확인");
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 15_000);
    const fallbackTick = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 15_000)?.[0];
    fetchMock.mockClear();
    await act(async () => {
      if (typeof fallbackTick === "function") await fallbackTick();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/speed-game/games/game-1", {
      cache: "no-store",
    });
  });

  it("serializes refreshes and runs one trailing reconciliation", async () => {
    let resolveFirst!: (value: unknown) => void;
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    fetchMock.mockReturnValueOnce(firstResponse);
    renderBoard();
    await waitFor(() => expect(realtime.status).toBeTypeOf("function"));

    act(() => realtime.status?.("SUBSCRIBED"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => {
      realtime.broadcast?.();
      realtime.broadcast?.();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ ok: true, json: async () => ({ game }) });
      await firstResponse;
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("waits for fallback response completion and backs off failed GETs", async () => {
    let resolveResponse!: (value: unknown) => void;
    const pendingResponse = new Promise((resolve) => {
      resolveResponse = resolve;
    });
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    renderBoard();
    await waitFor(() => expect(realtime.status).toBeTypeOf("function"));
    fetchMock.mockReset();
    fetchMock.mockReturnValueOnce(pendingResponse);
    setTimeoutSpy.mockClear();

    act(() => {
      realtime.status?.("CHANNEL_ERROR");
      realtime.status?.("CHANNEL_ERROR");
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      setTimeoutSpy.mock.calls.some(([, delay]) => delay === 15_000 || delay === 30_000),
    ).toBe(false);

    await act(async () => {
      resolveResponse({ ok: false });
      await pendingResponse;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setTimeoutSpy.mock.calls.map(([, delay]) => delay)).toContain(30_000);
  });

  it("removes the live channel and fallback when a snapshot is terminal", async () => {
    const finishedGame = { ...game, status: "finished" as const };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ game: finishedGame }),
    });
    renderBoard();
    await waitFor(() => expect(realtime.status).toBeTypeOf("function"));

    await act(async () => realtime.status?.("CHANNEL_ERROR"));

    await waitFor(() => expect(realtime.removeChannel).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).toBeNull();
    fetchMock.mockClear();
    realtime.broadcast?.();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not subscribe when the initial game is already finished", async () => {
    renderBoard({ ...game, status: "finished" });

    await act(async () => Promise.resolve());
    expect(realtime.status).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not let an older in-flight snapshot revive a finished game", async () => {
    let resolveResponse!: (value: unknown) => void;
    const pendingResponse = new Promise((resolve) => {
      resolveResponse = resolve;
    });
    fetchMock.mockReturnValueOnce(pendingResponse);
    const view = renderBoard();
    await waitFor(() => expect(realtime.status).toBeTypeOf("function"));
    act(() => realtime.status?.("SUBSCRIBED"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    view.rerender(
      <SpeedGameBoard
        boardId="board-1"
        boardSlug="speed"
        classroomId="classroom-1"
        viewerKind="teacher"
        currentStudentId={null}
        initialGame={{ ...game, status: "finished" }}
      />,
    );
    await waitFor(() => expect(realtime.removeChannel).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveResponse({ ok: true, json: async () => ({ game }) });
      await pendingResponse;
    });

    expect(screen.getByText("종료", { selector: ".speed-game-status" })).toBeTruthy();
  });
});
