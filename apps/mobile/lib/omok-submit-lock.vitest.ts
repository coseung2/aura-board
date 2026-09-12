import { describe, expect, it } from "vitest";
import { createOmokSubmitLock } from "./omok-submit-lock";
import {
  aimAt,
  confirmAim,
  initialOmokMachineState,
  type OmokMachineState,
} from "./omok-move-machine";
import { isOmokBotSession, makeOmokCommand, type OmokSnapshot } from "./omok-contract";

function snapshot(overrides: Partial<OmokSnapshot> = {}): OmokSnapshot {
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
      board: Array(225).fill(null),
      nextTurn: "first",
      status: { status: "playing" },
      moveCount: 0,
      lastMove: null,
    },
    outcome: null,
    ...overrides,
  };
}

describe("same-frame submit lock", () => {
  it("admits only one of two confirms dispatched in the same JS frame", () => {
    // Reproduces the live defect: `busy`/state guards are not visible to a
    // second handler in the same frame, so both taps produced a command at the
    // same expectedVersion.
    const lock = createOmokSubmitLock();
    let state: OmokMachineState = aimAt(
      { ...initialOmokMachineState, snapshot: snapshot() },
      { row: 7, column: 7 },
    ).state;
    const sent: string[] = [];

    const confirm = () => {
      if (!lock.acquire()) return;
      const transition = confirmAim(state, makeOmokCommand);
      state = transition.state;
      for (const effect of transition.effects) {
        if (effect.type === "send") sent.push(effect.pending.request.requestId);
      }
    };

    confirm();
    confirm();

    expect(sent).toHaveLength(1);
    expect(lock.isHeld()).toBe(true);
  });

  it("admits the next submission only after release", () => {
    const lock = createOmokSubmitLock();
    expect(lock.acquire()).toBe(true);
    expect(lock.acquire()).toBe(false);
    lock.release();
    expect(lock.acquire()).toBe(true);
  });
});

describe("bot transport", () => {
  it("keeps a bot session on the HTTP command path", () => {
    const bot = snapshot({
      participants: [
        { displayName: "test", slot: "first", ready: true },
        { displayName: "오목봇", slot: "second", ready: true },
      ],
    });
    expect(isOmokBotSession(bot)).toBe(true);
    expect(isOmokBotSession(snapshot())).toBe(false);
  });

  it("does not treat a same-named viewer as the bot opponent", () => {
    const viewerNamedLikeBot = snapshot({
      participants: [
        { displayName: "오목봇", slot: "first", ready: true },
        { displayName: "공서희", slot: "second", ready: true },
      ],
      viewer: { role: "participant", slot: "first", capabilities: { canRematch: false } },
    });
    expect(isOmokBotSession(viewerNamedLikeBot)).toBe(false);
  });
});
