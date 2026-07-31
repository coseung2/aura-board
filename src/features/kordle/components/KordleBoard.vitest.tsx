import "@testing-library/jest-dom/vitest";

import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KordlePublicState } from "../engine";

const createPublicSupabaseClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({ createPublicSupabaseClient }));

import { KordleBoard } from "./KordleBoard";

const initialState: KordlePublicState = {
  puzzleId: "puzzle-1",
  status: "IN_PROGRESS",
  wordLength: 5,
  maxGuesses: 6,
  guesses: [],
  nextGuessIndex: 1,
  absentLetters: [],
  solvedAtGuess: null,
  turn: {
    currentGuessIndex: 1,
    nextGuessIndex: 1,
    submittedCount: 0,
    totalCount: 1,
    isWaiting: false,
    isPendingJoin: false,
    roundDurationMs: 60_000,
    roundStartedAt: null,
    roundEndsAt: null,
    remainingMs: 60_000,
  },
  winnerStats: { leaderboard: [], rounds: [] },
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

describe("KordleBoard realtime transport", () => {
  let statusListener: ((status: string) => void) | undefined;
  let channel: {
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    statusListener = undefined;
    channel = {
      on: vi.fn(),
      subscribe: vi.fn((listener: (status: string) => void) => {
        statusListener = listener;
        return channel;
      }),
    };
    channel.on.mockReturnValue(channel);
    createPublicSupabaseClient.mockReturnValue({
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    createPublicSupabaseClient.mockReset();
  });

  it("stops fallback polling after SUBSCRIBED and reconciles once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ state: initialState }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <KordleBoard
        boardId="board-1"
        initialState={initialState}
        attemptId="attempt-1"
        locale="en"
      />,
    );

    await waitFor(() => expect(channel.subscribe).toHaveBeenCalledTimes(1));
    act(() => statusListener?.("SUBSCRIBED"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
