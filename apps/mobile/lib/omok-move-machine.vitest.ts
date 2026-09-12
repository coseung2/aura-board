import { describe, expect, it } from "vitest";
import {
  adoptPending,
  aimAt,
  applyCommitted,
  applyRejection,
  canPlaceStone,
  confirmAim,
  ingestSnapshot,
  initialOmokMachineState,
  markPendingUnconfirmed,
  mergeSnapshot,
  projectPendingBoard,
  startIntent,
  type OmokMachineState,
} from "./omok-move-machine";
import { parseOmokServerFrame } from "./omok-protocol";
import { makeOmokCommand, type OmokSnapshot } from "./omok-contract";

function snapshot(overrides: Partial<OmokSnapshot> = {}): OmokSnapshot {
  const board: OmokSnapshot["game"]["board"] = Array(225).fill(null);
  return {
    sessionId: "session-a",
    boardId: "board-1",
    gameKind: "omok",
    version: 4,
    serverTimeMs: 1_000,
    rulesVersion: 1,
    stateSchemaVersion: 1,
    previousSessionId: null,
    roomStatus: "active",
    participants: [
      { displayName: "test", slot: "first", ready: true },
      { displayName: "공서희", slot: "second", ready: true },
    ],
    viewer: { role: "participant", slot: "first", capabilities: { canRematch: false } },
    game: {
      board,
      nextTurn: "first",
      status: { status: "playing" },
      moveCount: 0,
      lastMove: null,
    },
    outcome: null,
    ...overrides,
  };
}

function withStone(base: OmokSnapshot, index: number, slot: "first" | "second"): OmokSnapshot {
  const board = base.game.board.slice();
  board[index] = slot;
  return {
    ...base,
    game: {
      ...base.game,
      board,
      moveCount: board.filter((cell) => cell !== null).length,
    },
  };
}

function seeded(state: Partial<OmokMachineState> = {}): OmokMachineState {
  return { ...initialOmokMachineState, snapshot: snapshot(), ...state };
}

describe("omok per-session version reducer", () => {
  it("does not roll back to a delayed lower version after a committed higher version", () => {
    // Reproduces the live defect: an HTTP refresh started before the command
    // resolves after it, and previously overwrote v5 with v4.
    const committed = { ...snapshot({ version: 5 }) };
    const state = ingestSnapshot(seeded(), committed).state;
    expect(state.snapshot?.version).toBe(5);

    const delayed = ingestSnapshot(state, snapshot({ version: 4 })).state;
    expect(delayed.snapshot?.version).toBe(5);
  });

  it("ignores an equal version and converges on a higher version despite gaps", () => {
    const base = seeded();
    const equal = mergeSnapshot(base, snapshot({ version: 4, serverTimeMs: 9_999 }));
    expect(equal.applied).toBe(false);
    expect(equal.state.snapshot?.serverTimeMs).toBe(1_000);

    const jumped = mergeSnapshot(base, snapshot({ version: 9 }));
    expect(jumped.applied).toBe(true);
    expect(jumped.state.snapshot?.version).toBe(9);
  });

  it("ignores a foreign session unless it is an explicit replacement", () => {
    const base = seeded();
    const foreign = snapshot({ sessionId: "session-b", version: 1 });

    expect(mergeSnapshot(base, foreign).applied).toBe(false);

    const replaced = ingestSnapshot(base, foreign, { replacesSession: true });
    expect(replaced.state.snapshot?.sessionId).toBe("session-b");
    expect(replaced.effects).toEqual(
      expect.arrayContaining([
        { type: "session_replaced", previousSessionId: "session-a", sessionId: "session-b" },
      ]),
    );
  });

  it("clears the superseded pending scope when the session is replaced", () => {
    const confirmed = confirmAim(aimAt(seeded(), { row: 7, column: 7 }).state, makeOmokCommand);
    const replaced = ingestSnapshot(
      confirmed.state,
      snapshot({ sessionId: "session-b", version: 1 }),
      { replacesSession: true },
    );
    expect(replaced.state.pending).toBeNull();
    expect(replaced.effects).toEqual(
      expect.arrayContaining([
        { type: "clear_pending", sessionId: "session-a", commandType: "place_stone" },
      ]),
    );
  });
});

describe("omok pending settlement", () => {
  it("paints a pending stone in the confirming transition and asks to persist and send", () => {
    const aimed = aimAt(seeded(), { row: 7, column: 7 });
    expect(aimed.state.aim).toEqual({ row: 7, column: 7 });
    expect(aimed.state.pending).toBeNull();
    expect(aimed.effects).toHaveLength(0);

    const confirmed = confirmAim(aimed.state, makeOmokCommand);
    expect(confirmed.state.pending?.stone).toEqual({
      position: { row: 7, column: 7 },
      slot: "first",
    });
    expect(projectPendingBoard(confirmed.state)?.[112]).toBe("first");
    expect(confirmed.effects.map((effect) => effect.type)).toEqual([
      "placement_feedback",
      "persist_pending",
      "send",
    ]);
  });

  it("blocks a second confirm while a pending command exists", () => {
    const confirmed = confirmAim(aimAt(seeded(), { row: 7, column: 7 }).state, makeOmokCommand);
    const again = aimAt(confirmed.state, { row: 8, column: 8 });
    expect(again.state.aim).toBeNull();
    expect(confirmAim(again.state, makeOmokCommand).effects).toHaveLength(0);
  });

  it("does not settle durable pending on an equal generic snapshot", () => {
    const confirmed = confirmAim(aimAt(seeded(), { row: 7, column: 7 }).state, makeOmokCommand);
    const generic = ingestSnapshot(confirmed.state, snapshot({ version: 4 }));
    expect(generic.state.pending).not.toBeNull();
    expect(generic.effects).toHaveLength(0);
  });

  it("does not settle durable pending on an uncorrelated higher snapshot", () => {
    const confirmed = confirmAim(aimAt(seeded(), { row: 7, column: 7 }).state, makeOmokCommand);
    const peer = ingestSnapshot(confirmed.state, withStone(snapshot({ version: 5 }), 112, "first"));
    expect(peer.state.snapshot?.version).toBe(5);
    expect(peer.state.pending).not.toBeNull();
    expect(peer.effects.some((effect) => effect.type === "clear_pending")).toBe(false);
  });

  it("settles pending on a correlated older replayed commit without rolling back the board", () => {
    const confirmed = confirmAim(aimAt(seeded(), { row: 7, column: 7 }).state, makeOmokCommand);
    const requestId = confirmed.state.pending!.request.requestId;
    const advanced = ingestSnapshot(confirmed.state, snapshot({ version: 7 })).state;

    const settled = applyCommitted(advanced, {
      type: "command_committed",
      protocolVersion: 1,
      sessionId: "session-a",
      requestId,
      commandType: "place_stone",
      previousVersion: 4,
      version: 5,
      replayed: true,
      snapshot: withStone(snapshot({ version: 5 }), 112, "first"),
    });
    expect(settled.state.pending).toBeNull();
    expect(settled.state.snapshot?.version).toBe(7);
    expect(settled.effects).toEqual([
      { type: "clear_pending", sessionId: "session-a", commandType: "place_stone" },
    ]);
  });

  it("ignores a commit correlated to another request", () => {
    const confirmed = confirmAim(aimAt(seeded(), { row: 7, column: 7 }).state, makeOmokCommand);
    const settled = applyCommitted(confirmed.state, {
      type: "command_committed",
      protocolVersion: 1,
      sessionId: "session-a",
      requestId: "place_stone.someone-else",
      commandType: "place_stone",
      previousVersion: 4,
      version: 5,
      replayed: false,
      snapshot: withStone(snapshot({ version: 5 }), 30, "first"),
    });
    expect(settled.state.pending).not.toBeNull();
    expect(settled.state.snapshot?.version).toBe(5);
  });

  it("rolls back to authority on a terminal rejection and keeps pending on a retriable one", () => {
    const confirmed = confirmAim(aimAt(seeded(), { row: 7, column: 7 }).state, makeOmokCommand);
    const requestId = confirmed.state.pending!.request.requestId;
    const conflictSnapshot = withStone(snapshot({ version: 5 }), 112, "second");

    const rejected = applyRejection(confirmed.state, {
      type: "command_rejected",
      protocolVersion: 1,
      sessionId: "session-a",
      requestId,
      commandType: "place_stone",
      error: "version_conflict",
      retryable: false,
      currentVersion: 5,
      snapshot: conflictSnapshot,
    });
    expect(rejected.state.pending).toBeNull();
    expect(rejected.state.error).toContain("최신 판");
    expect(projectPendingBoard(rejected.state)?.[112]).toBe("second");

    const retriable = applyRejection(confirmed.state, {
      type: "command_rejected",
      protocolVersion: 1,
      sessionId: "session-a",
      requestId,
      commandType: "place_stone",
      error: "server_error",
      retryable: true,
      currentVersion: null,
      snapshot: null,
    });
    expect(retriable.state.pending).not.toBeNull();
  });

  it("keeps pending as 확인 중 on ack timeout and replays the same requestId", () => {
    const confirmed = confirmAim(aimAt(seeded(), { row: 7, column: 7 }).state, makeOmokCommand);
    const requestId = confirmed.state.pending!.request.requestId;

    const unconfirmed = markPendingUnconfirmed(confirmed.state);
    expect(unconfirmed.state.pending?.phase).toBe("confirming");
    expect(unconfirmed.state.pending?.request.requestId).toBe(requestId);
    expect(unconfirmed.effects).toEqual([
      { type: "send", pending: expect.objectContaining({
        request: expect.objectContaining({ requestId }),
      }) },
    ]);

    const replayed = adoptPending(
      { ...seeded(), pending: null },
      unconfirmed.state.pending!,
    );
    expect(replayed.effects).toEqual([
      { type: "send", pending: expect.objectContaining({ phase: "confirming" }) },
    ]);
    expect(replayed.state.pending?.request.requestId).toBe(requestId);
  });

  it("suppresses placement feedback when replaying an adopted pending command", () => {
    const pending = confirmAim(aimAt(seeded(), { row: 7, column: 7 }).state, makeOmokCommand)
      .state.pending!;
    const replayed = adoptPending({ ...seeded(), pending: null }, pending);
    expect(replayed.effects.some((effect) => effect.type === "placement_feedback")).toBe(false);
  });
});

describe("omok input gating", () => {
  it("refuses aim on an occupied intersection and off-turn or terminal states", () => {
    const occupied = { ...seeded(), snapshot: withStone(snapshot(), 112, "second") };
    expect(aimAt(occupied, { row: 7, column: 7 }).state.aim).toBeNull();

    const offTurn = { ...seeded(), snapshot: snapshot({ game: { ...snapshot().game, nextTurn: "second" } }) };
    expect(canPlaceStone(offTurn.snapshot)).toBe(false);
    expect(aimAt(offTurn, { row: 3, column: 3 }).state.aim).toBeNull();

    const finished = {
      ...seeded(),
      snapshot: snapshot({
        roomStatus: "finished",
        outcome: { winner: "second", reason: "resignation" },
        game: { ...snapshot().game, status: { status: "won", winner: "second" } },
      }),
    };
    expect(aimAt(finished, { row: 3, column: 3 }).state.aim).toBeNull();
    expect(startIntent(finished, { type: "resign" }, makeOmokCommand).effects).toHaveLength(0);
  });

  it("drops an aim that authority filled while it was held", () => {
    const aimed = aimAt(seeded(), { row: 7, column: 7 }).state;
    const merged = ingestSnapshot(aimed, withStone(snapshot({ version: 5 }), 112, "second"));
    expect(merged.state.aim).toBeNull();
  });

  it("scopes resign pending separately from a stone", () => {
    const resigned = startIntent(seeded(), { type: "resign" }, makeOmokCommand);
    expect(resigned.state.pending?.stone).toBeNull();
    expect(resigned.effects).toEqual([
      { type: "persist_pending", pending: expect.objectContaining({ sessionId: "session-a" }) },
      { type: "send", pending: expect.objectContaining({ sessionId: "session-a" }) },
    ]);
    expect(resigned.state.pending?.request.command.type).toBe("resign");
  });
});

describe("omok frame parsing", () => {
  it("rejects unknown protocol versions, oversized frames and malformed snapshots", () => {
    expect(parseOmokServerFrame({ type: "ready", protocolVersion: 2 })).toBeNull();
    expect(parseOmokServerFrame("x".repeat(64 * 1024 + 1))).toBeNull();
    expect(
      parseOmokServerFrame({ type: "snapshot", protocolVersion: 1, snapshot: { gameKind: "omok" } }),
    ).toBeNull();
    expect(parseOmokServerFrame("not json")).toBeNull();
  });

  it("accepts a committed frame only when the version matches its snapshot", () => {
    const valid = parseOmokServerFrame(
      JSON.stringify({
        type: "command_committed",
        protocolVersion: 1,
        sessionId: "session-a",
        requestId: "place_stone.a",
        commandType: "place_stone",
        previousVersion: 4,
        version: 5,
        replayed: false,
        snapshot: snapshot({ version: 5 }),
      }),
    );
    expect(valid?.type).toBe("command_committed");

    expect(
      parseOmokServerFrame({
        type: "command_committed",
        protocolVersion: 1,
        sessionId: "session-a",
        requestId: "place_stone.a",
        commandType: "place_stone",
        previousVersion: 4,
        version: 6,
        replayed: false,
        snapshot: snapshot({ version: 5 }),
      }),
    ).toBeNull();
  });

  it("accepts a valid session replacement and rejects an unrelated one", () => {
    const replacement = snapshot({
      sessionId: "session-b",
      previousSessionId: "session-a",
      version: 0,
    });
    const frame = parseOmokServerFrame({
      type: "session_replaced",
      protocolVersion: 1,
      reason: "rematch",
      previousSessionId: "session-a",
      sessionId: "session-b",
      snapshot: replacement,
    });
    expect(frame?.type).toBe("session_replaced");
    if (!frame || frame.type !== "session_replaced") throw new Error("missing replacement");

    const applied = ingestSnapshot(seeded(), frame.snapshot, { replacesSession: true });
    expect(applied.state.snapshot?.sessionId).toBe("session-b");
    expect(parseOmokServerFrame({ ...frame, previousSessionId: "session-x" })).toBeNull();
  });
});
