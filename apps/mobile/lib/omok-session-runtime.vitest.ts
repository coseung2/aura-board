import { describe, expect, it, vi } from "vitest";

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
  fetchCurrentOmokSession: async () => null,
  fetchOmokRealtimeTicket: async () => { throw new Error("network disabled"); },
  loadPendingOmokCommand: async () => null,
  makeOmokCommand: () => { throw new Error("not used by policy tests"); },
  migrateLegacyPendingOmokCommand: async () => null,
  playApiError: () => null,
  requestOmokRematch: async () => { throw new Error("network disabled"); },
  savePendingOmokCommand: async () => undefined,
  submitOmokCommand: async () => { throw new Error("network disabled"); },
}));

import {
  acquireOmokReplayLock,
  confirmsOmokAuthoritativeCatchUp,
  findDurableOmokPending,
  nextOmokCatchUpLock,
  sendOmokPendingViaAvailableTransport,
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

describe("Omok runtime recovery policy", () => {
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
});
