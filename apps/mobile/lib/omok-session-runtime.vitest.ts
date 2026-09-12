// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  fetchCurrentOmokSession: vi.fn(),
  onSocketStatus: null as null | ((status: import("./omok-socket").OmokSocketStatus) => void),
}));

// The hook renderer lives at the workspace root, so the source-under-test must
// share that exact React instance instead of the mobile package's second copy.
// @ts-expect-error The runtime package path intentionally has no local declaration entry.
vi.mock("react", async () => import("../../../node_modules/react"));
vi.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
}));
vi.mock("./api", () => ({
  ApiError: class ApiError extends Error {
    status = 0;
    body: unknown = null;
  },
  apiFetch: async () => { throw new Error("network disabled in unit test"); },
}));
vi.mock("./play-platform", () => ({
  clearPendingOmokCommand: async () => undefined,
  fetchCurrentOmokSession: runtimeMocks.fetchCurrentOmokSession,
  fetchOmokRealtimeTicket: async () => { throw new Error("network disabled"); },
  loadPendingOmokCommand: async () => null,
  makeOmokCommand: () => { throw new Error("not used by policy tests"); },
  migrateLegacyPendingOmokCommand: async () => null,
  playApiError: () => null,
  requestOmokRematch: async () => { throw new Error("network disabled"); },
  savePendingOmokCommand: async () => undefined,
  submitOmokCommand: async () => { throw new Error("network disabled"); },
}));
vi.mock("./omok-socket", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./omok-socket")>();
  return {
    ...actual,
    createNativeOmokConnect: () => vi.fn(),
    createOmokSocket: vi.fn((options: {
      onStatus: (status: import("./omok-socket").OmokSocketStatus) => void;
    }) => {
      runtimeMocks.onSocketStatus = options.onStatus;
      options.onStatus("connecting");
      return {
        dispose: vi.fn(),
        getHandshakeAttempts: () => 0,
        getStatus: () => "connecting",
        reset: vi.fn(),
        sendCommand: vi.fn(() => false),
        setActive: vi.fn(),
      };
    }),
  };
});

import {
  acquireOmokReplayLock,
  confirmsOmokAuthoritativeCatchUp,
  createOmokPendingPersistenceQueue,
  findDurableOmokPending,
  nextOmokCatchUpLock,
  sendOmokPendingViaAvailableTransport,
  useOmokSessionRuntime,
} from "./omok-session-runtime";
import {
  adoptPending,
  applyCommitted,
  ingestSnapshot,
  initialOmokMachineState,
  type OmokPending,
} from "./omok-move-machine";
import type { OmokSnapshot } from "./omok-contract";
import { shouldPollActiveOmokGame } from "./omok-socket";
import { createOmokSubmitLock } from "./omok-submit-lock";

function snapshot(version: number, sessionId = "session-a"): OmokSnapshot {
  return {
    sessionId,
    boardId: "board-1",
    gameKind: "omok",
    version,
    serverTimeMs: 1_000,
    rulesVersion: 1,
    stateSchemaVersion: 1,
    previousSessionId: sessionId === "session-a" ? null : "session-a",
    roomStatus: "active",
    participants: [
      { displayName: "One", slot: "first", ready: true },
      { displayName: "Two", slot: "second", ready: true },
    ],
    viewer: { role: "participant", slot: "first", capabilities: { canRematch: false } },
    game: {
      board: Array(225).fill(null),
      nextTurn: "first",
      status: { status: "playing" },
      moveCount: version,
      lastMove: null,
    },
    outcome: null,
  };
}

const pending: OmokPending = {
  sessionId: "session-a",
  request: {
    requestId: "place_stone.durable",
    expectedVersion: 4,
    commandSchemaVersion: 1,
    command: { type: "place_stone", position: { row: 7, column: 7 } },
  },
  stone: null,
  phase: "confirming",
};

afterEach(() => {
  vi.useRealTimers();
  runtimeMocks.fetchCurrentOmokSession.mockReset();
  runtimeMocks.onSocketStatus = null;
});

describe("Omok runtime recovery policy", () => {
  it("serializes a fast acknowledgement clear after the pending save", async () => {
    const events: string[] = [];
    let finishSave: () => void = () => {
      throw new Error("save did not start");
    };
    const save = vi.fn(async () => {
      events.push("save:start");
      await new Promise<void>((resolve) => {
        finishSave = resolve;
      });
      events.push("save:end");
    });
    const clear = vi.fn(async () => {
      events.push("clear");
    });
    const queue = createOmokPendingPersistenceQueue(save, clear);

    const saving = queue.persist(pending);
    await Promise.resolve();
    const clearing = queue.clear("session-a", "place_stone");
    await Promise.resolve();

    expect(events).toEqual(["save:start"]);
    expect(clear).not.toHaveBeenCalled();
    finishSave();
    await Promise.all([saving, clearing]);

    expect(events).toEqual(["save:start", "save:end", "clear"]);
    expect(clear).toHaveBeenCalledWith("session-a", "place_stone");
  });

  it("recreates from durable pending, replays the same id, and settles once", async () => {
    const load = vi.fn(async (_sessionId: string, commandType: "place_stone" | "resign" | "ready") =>
      commandType === "place_stone" ? pending : null,
    );
    const restored = await findDurableOmokPending("session-a", load);
    expect(restored?.request.requestId).toBe("place_stone.durable");

    const replay = adoptPending(
      { ...initialOmokMachineState, snapshot: snapshot(4) },
      restored!,
    );
    expect(replay.effects[0]).toEqual({
      type: "send",
      pending: expect.objectContaining({
        request: expect.objectContaining({ requestId: "place_stone.durable" }),
      }),
    });
    const frame = {
      type: "command_committed" as const,
      protocolVersion: 1 as const,
      sessionId: "session-a",
      requestId: "place_stone.durable",
      commandType: "place_stone" as const,
      previousVersion: 4,
      version: 5,
      replayed: true,
      snapshot: snapshot(5),
    };
    const committed = applyCommitted(replay.state, frame);
    expect(committed.state.pending).toBeNull();
    expect(applyCommitted(committed.state, frame).effects).toEqual([]);
  });

  it("waits through submit-lock contention before adopting the durable request", async () => {
    const lock = createOmokSubmitLock();
    expect(lock.acquire()).toBe(true);
    let waits = 0;
    const acquired = await acquireOmokReplayLock(
      lock,
      () => false,
      async () => {
        waits += 1;
        lock.release();
      },
    );
    expect(acquired).toBe(true);
    expect(waits).toBe(1);
    expect(lock.isHeld()).toBe(true);

    const replay = adoptPending(
      { ...initialOmokMachineState, snapshot: snapshot(4) },
      pending,
    );
    expect(replay.effects).toContainEqual({
      type: "send",
      pending: expect.objectContaining({
        request: expect.objectContaining({ requestId: "place_stone.durable" }),
      }),
    });
    lock.release();
  });

  it("terminates blocked realtime submission through HTTP with the same request", async () => {
    const socket = { sendCommand: vi.fn(() => true) };
    const submitOverHttp = vi.fn(async () => undefined);
    await expect(sendOmokPendingViaAvailableTransport({
      pending,
      transport: "blocked",
      socket,
      submitOverHttp,
    })).resolves.toBe("http");
    expect(socket.sendCommand).not.toHaveBeenCalled();
    expect(submitOverHttp).toHaveBeenCalledOnce();
    expect(submitOverHttp).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ requestId: "place_stone.durable" }),
      }),
    );
  });

  it("polls through interruption, catches up monotonically, unlocks, and stops on ready", () => {
    expect(shouldPollActiveOmokGame("connecting", "active")).toBe(true);
    expect(shouldPollActiveOmokGame("unavailable", null)).toBe(false);
    expect(shouldPollActiveOmokGame("unavailable", "finished")).toBe(false);
    let locked = nextOmokCatchUpLock({
      current: false,
      previousSocketStatus: "ready",
      socketStatus: "connecting",
      roomStatus: "active",
    });
    expect(locked).toBe(true);
    const v5 = ingestSnapshot(
      { ...initialOmokMachineState, snapshot: snapshot(4) },
      snapshot(5),
    ).state;
    expect(ingestSnapshot(v5, snapshot(4)).state.snapshot?.version).toBe(5);
    locked = nextOmokCatchUpLock({
      current: locked,
      previousSocketStatus: "connecting",
      socketStatus: "connecting",
      roomStatus: "active",
      authoritativeSnapshotApplied: true,
    });
    expect(locked).toBe(false);
    expect(shouldPollActiveOmokGame("ready", "active")).toBe(false);

    expect(confirmsOmokAuthoritativeCatchUp(snapshot(5), snapshot(4), false)).toBe(false);
    expect(confirmsOmokAuthoritativeCatchUp(snapshot(5), snapshot(5), false)).toBe(true);
    expect(confirmsOmokAuthoritativeCatchUp(snapshot(5), snapshot(6), false)).toBe(true);
    expect(
      confirmsOmokAuthoritativeCatchUp(snapshot(5), snapshot(0, "session-b"), true),
    ).toBe(true);

    expect(nextOmokCatchUpLock({
      current: false,
      previousSocketStatus: "idle",
      socketStatus: "connecting",
      roomStatus: "active",
    })).toBe(false);
  });

  it("does not let reconnect status churn postpone active-game HTTP recovery", async () => {
    vi.useFakeTimers();
    const refreshTimes: number[] = [];
    runtimeMocks.fetchCurrentOmokSession.mockImplementation(async () => {
      refreshTimes.push(Date.now());
      return snapshot(1);
    });
    const onPlacementFeedback = vi.fn();
    const onUnauthorized = vi.fn();

    const hook = renderHook(() => useOmokSessionRuntime({
      boardId: "board-1",
      onPlacementFeedback,
      onUnauthorized,
    }));
    await act(async () => undefined);
    expect(runtimeMocks.fetchCurrentOmokSession).toHaveBeenCalled();
    expect(runtimeMocks.onSocketStatus).not.toBeNull();
    const mountedAt = Date.now();

    for (const [delay, status] of [
      [1_000, "unavailable"],
      [1_000, "connecting"],
      [100, "unavailable"],
      [2_000, "connecting"],
      [100, "unavailable"],
    ] as const) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay);
        runtimeMocks.onSocketStatus?.(status);
      });
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(refreshTimes.some((calledAt) => calledAt - mountedAt >= 3_000)).toBe(true);
    const callsAfterRecovery = refreshTimes.length;
    await act(async () => {
      runtimeMocks.onSocketStatus?.("ready");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(refreshTimes).toHaveLength(callsAfterRecovery);
    hook.unmount();
  });
});
