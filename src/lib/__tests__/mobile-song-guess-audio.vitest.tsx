import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SongGuessSnapshot } from "../../../apps/mobile/lib/song-guess-contract";

const mocks = vi.hoisted(() => ({
  player: { play: vi.fn(), pause: vi.fn(), replace: vi.fn(), muted: false, loop: false },
  status: { isLoaded: true, playing: false, playbackState: "ready" },
  load: vi.fn(),
  listeners: new Set<(state: string) => void>(),
  app: { currentState: "active" },
}));
// Resolve the same modules as the native hook without executing native code.
vi.mock("../../../apps/mobile/node_modules/react/index.js", async () => import("react"));
vi.mock("../../../apps/mobile/node_modules/expo-audio/build/index.js", () => ({
  useAudioPlayer: () => mocks.player,
  useAudioPlayerStatus: () => mocks.status,
}));
vi.mock("../../../apps/mobile/node_modules/react-native/index.js", () => ({ AppState: {
  get currentState() { return mocks.app.currentState; },
  addEventListener: (_event: string, listener: (state: string) => void) => {
    mocks.listeners.add(listener);
    return { remove: () => mocks.listeners.delete(listener) };
  },
} }));
vi.mock("../../../apps/mobile/lib/song-guess", () => ({
  loadSongGuessAudioSource: mocks.load,
  monotonicNow: () => performance.now(),
}));
// Keep React Native's ambient globals out of the web TypeScript program.
// Vitest still imports and executes the real hook with the native ports mocked.
const nativeHookPath = "../../../apps/mobile/components/song-guess/use-song-guess-round-audio.ts";
const { useSongGuessRoundAudio } = await import(nativeHookPath) as {
  useSongGuessRoundAudio: (value: SongGuessSnapshot | null, muted: boolean) => { error: string | null; retry: () => void };
};

function snapshot(overrides: Partial<SongGuessSnapshot> = {}): SongGuessSnapshot {
  return { sessionId: "s1", boardId: "b", gameKind: "song-guess", version: 1, serverTimeMs: 1000,
    rulesVersion: 2, stateSchemaVersion: 2, previousSessionId: null, phase: "guessing",
    currentRound: { roundId: "r1", order: 0, accessibilityClue: null, revealedAnswer: null,
      startedAtMs: 1000, deadlineAtMs: 8500,
      currentClip: { assetId: "asset", tierMs: 15000, durationMs: 7300, mimeType: "audio/wav", sizeBytes: 5 } },
    participants: [], viewer: { role: "participant", joined: true, scoredCurrentRound: false }, ...overrides };
}
function visibility(state: string) {
  mocks.app.currentState = state;
  for (const listener of mocks.listeners) listener(state);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  mocks.app.currentState = "active";
  mocks.status.isLoaded = true;
  mocks.status.playbackState = "ready";
  mocks.player.loop = false;
  mocks.load.mockResolvedValue({ uri: "private-audio", headers: { Authorization: "test-only" } });
});
afterEach(() => { cleanup(); mocks.listeners.clear(); vi.useRealTimers(); });

describe("native round audio lifecycle", () => {
  it("autoplays and loops the actual source without an assumed 15-second timer", async () => {
    renderHook(() => useSongGuessRoundAudio(snapshot(), false));
    await act(async () => undefined);
    expect(mocks.player.loop).toBe(true);
    expect(mocks.player.play).toHaveBeenCalledTimes(1);
    const paused = mocks.player.pause.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(7499); });
    expect(mocks.player.pause).toHaveBeenCalledTimes(paused);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.player.pause.mock.calls.length).toBeGreaterThan(paused);
  });

  it("does not restart for a fresh snapshot or a mute change in the same round", async () => {
    const state = snapshot();
    const hook = renderHook(({ value, muted }) => useSongGuessRoundAudio(value, muted), { initialProps: { value: state, muted: false } });
    await act(async () => undefined);
    hook.rerender({ value: { ...state, serverTimeMs: 1200 }, muted: true });
    await act(async () => undefined);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.player.play).toHaveBeenCalledTimes(1);
    expect(mocks.player.muted).toBe(true);
  });

  it("requires a reconciled snapshot before foreground playback resumes", async () => {
    const state = snapshot();
    const hook = renderHook(({ value }) => useSongGuessRoundAudio(value, false), { initialProps: { value: state } });
    await act(async () => undefined);
    act(() => { visibility("background"); visibility("active"); });
    expect(mocks.player.play).toHaveBeenCalledTimes(1);
    hook.rerender({ value: { ...state, serverTimeMs: 2000 } });
    await act(async () => undefined);
    expect(mocks.player.play).toHaveBeenCalledTimes(2);
  });

  it("does not resume an expired or ended round on foreground", async () => {
    const state = snapshot();
    const hook = renderHook(({ value }) => useSongGuessRoundAudio(value, false), { initialProps: { value: state } });
    await act(async () => undefined);
    act(() => visibility("background"));
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    act(() => visibility("active"));
    hook.rerender({ value: { ...state, phase: "reveal", serverTimeMs: 10000 } });
    await act(async () => undefined);
    expect(mocks.player.play).toHaveBeenCalledTimes(1);
    expect(mocks.player.replace).toHaveBeenLastCalledWith(null);
  });

  it("reloads a reused asset for a different round and ignores late obsolete loads", async () => {
    let old!: (value: { uri: string }) => void;
    mocks.load.mockImplementationOnce(() => new Promise((resolve) => { old = resolve; }));
    const state = snapshot();
    const hook = renderHook(({ value }) => useSongGuessRoundAudio(value, false), { initialProps: { value: state } });
    hook.rerender({ value: { ...state, version: 2, currentRound: { ...state.currentRound, roundId: "r2" } } });
    await act(async () => undefined);
    await act(async () => old({ uri: "obsolete" }));
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.player.replace).not.toHaveBeenCalledWith({ uri: "obsolete" });
    expect(mocks.player.play).toHaveBeenCalledTimes(1);
  });

  it("refetches failed audio on retry instead of requiring an already-loaded player", async () => {
    mocks.load.mockRejectedValueOnce(new Error("offline"));
    const state = snapshot();
    const hook = renderHook(() => useSongGuessRoundAudio(state, false));
    await act(async () => undefined);
    expect(hook.result.current.error).toBeTruthy();
    act(() => hook.result.current.retry());
    await act(async () => undefined);
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(hook.result.current.error).toBeNull();
    expect(mocks.player.play).toHaveBeenCalledTimes(1);
  });

  it("ignores a source response after unmount and unregisters visibility listeners", async () => {
    let finish!: (source: { uri: string }) => void;
    mocks.load.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const hook = renderHook(() => useSongGuessRoundAudio(snapshot(), false));
    hook.unmount();
    await act(async () => finish({ uri: "late" }));
    expect(mocks.player.replace).not.toHaveBeenCalledWith({ uri: "late" });
    expect(mocks.player.play).not.toHaveBeenCalled();
    expect(mocks.listeners.size).toBe(0);
  });
});
