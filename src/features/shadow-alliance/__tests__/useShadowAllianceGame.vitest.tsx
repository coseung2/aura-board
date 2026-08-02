import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShadowAllianceSnapshot } from "@/lib/shadow-alliance/contracts";
import { useShadowAllianceGame } from "../useShadowAllianceGame";

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

function response(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("useShadowAllianceGame authoritative snapshot adapter", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ snapshot })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the server-owned snapshot without exposing browser mutation authority", async () => {
    const { result, unmount } = renderHook(() =>
      useShadowAllianceGame("board-1"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.snapshot).toEqual(snapshot);
    expect(result.current.error).toBeNull();
    expect(Object.keys(result.current).sort()).toEqual([
      "error",
      "loading",
      "refresh",
      "snapshot",
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/shadow-alliance/boards/board-1",
      expect.objectContaining({ cache: "no-store" }),
    );
    unmount();
  });

  it("refreshes from the authoritative endpoint and replaces stale state", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(response({ snapshot }))
      .mockResolvedValueOnce(
        response({ snapshot: { ...snapshot, version: 4, phase: "playing" } }),
      );
    const { result, unmount } = renderHook(() =>
      useShadowAllianceGame("board-1"),
    );
    await waitFor(() => expect(result.current.snapshot?.version).toBe(3));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.snapshot).toMatchObject({
      version: 4,
      phase: "playing",
    });
    unmount();
  });

  it("keeps the last snapshot and reports a recoverable network error", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(response({ snapshot }))
      .mockRejectedValueOnce(new Error("offline"));
    const { result, unmount } = renderHook(() =>
      useShadowAllianceGame("board-1"),
    );
    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.snapshot).toEqual(snapshot);
    expect(result.current.error).toBe("network_error");
    unmount();
  });
});
