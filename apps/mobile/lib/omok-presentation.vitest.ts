import { describe, expect, it } from "vitest";
import type { OmokSnapshot } from "./omok-contract";
import { omokBoardFrame } from "./omok-geometry";
import {
  initialOmokMachineState,
  type OmokMachineState,
} from "./omok-move-machine";
import {
  omokConnectionNotice,
  omokHintText,
  omokOutcomeTitle,
  omokRematchMessage,
  omokTurnBanner,
} from "./omok-presentation";
import { omokTokens, spacing } from "../theme/tokens";

function snapshot(overrides: Partial<OmokSnapshot> = {}): OmokSnapshot {
  return {
    sessionId: "session-a",
    boardId: "board-a",
    gameKind: "omok",
    version: 4,
    serverTimeMs: 1_000,
    rulesVersion: 1,
    stateSchemaVersion: 1,
    previousSessionId: null,
    roomStatus: "active",
    participants: [
      { displayName: "나", slot: "first", ready: true },
      { displayName: "친구", slot: "second", ready: true },
    ],
    viewer: {
      role: "participant",
      slot: "first",
      capabilities: { canRematch: false },
    },
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

function state(overrides: Partial<OmokMachineState> = {}): OmokMachineState {
  return { ...initialOmokMachineState, snapshot: snapshot(), ...overrides };
}

describe("Omok commercial presentation", () => {
  it.each([
    { name: "A20", width: 360, height: 780 },
    { name: "S23", width: 393, height: 851 },
  ])("keeps the board width-maximized with terminal and recovery chrome on $name", ({
    width,
    height,
  }) => {
    for (const reservedHeight of [
      omokTokens.reservedHeight,
      omokTokens.reservedHeight + omokTokens.recoveryReservedHeight,
      omokTokens.terminalReservedHeight,
      omokTokens.terminalReservedHeight + omokTokens.recoveryReservedHeight,
    ]) {
      const frame = omokBoardFrame({
        width,
        height,
        reservedHeight,
        horizontalPadding: spacing.md,
        maxEdge: omokTokens.boardMaxEdge,
        minEdge: omokTokens.boardMinEdge,
      });
      expect(frame.boardEdge).toBe(width - spacing.md * 2);
      expect(frame.boardEdge + reservedHeight).toBeLessThanOrEqual(height);
    }
  });

  it("keeps a healthy connection quiet and makes recovery copy action-oriented", () => {
    expect(
      omokConnectionNotice("ready", { httpRecovering: false, offline: false }),
    ).toBeNull();

    const offline = omokConnectionNotice("unavailable", {
      httpRecovering: true,
      offline: true,
    });
    const degraded = omokConnectionNotice("degraded", {
      httpRecovering: false,
      offline: false,
    });
    expect(offline).toContain("다시 시도");
    expect(degraded).toContain("다시 확인");
    expect(`${offline} ${degraded}`).not.toMatch(/HTTP|WebSocket|실시간/i);
  });

  it("announces the selected one-based coordinate before confirmation", () => {
    expect(omokHintText(state({ aim: { row: 7, column: 8 } }))).toBe(
      "선택: 8행 9열 · 이 자리에 둘까요?",
    );
  });

  it("distinguishes sending from authority confirmation", () => {
    const pending = {
      sessionId: "session-a",
      request: {
        requestId: "place_stone.1",
        expectedVersion: 4,
        commandSchemaVersion: 1 as const,
        command: { type: "place_stone" as const, position: { row: 7, column: 7 } },
      },
      stone: { position: { row: 7, column: 7 }, slot: "first" as const },
      phase: "sending" as const,
    };
    expect(omokHintText(state({ pending }))).toContain("보내는 중");
    expect(
      omokHintText(state({ pending: { ...pending, phase: "confirming" } })),
    ).toContain("결과를 확인");
  });

  it("gives the local turn stronger emphasis than a peer turn", () => {
    expect(omokTurnBanner(state())).toEqual({ text: "내 차례", emphasis: "mine" });
    expect(
      omokTurnBanner(
        state({
          snapshot: snapshot({
            game: { ...snapshot().game, nextTurn: "second" },
          }),
        }),
      ),
    ).toEqual({ text: "상대 차례", emphasis: "peer" });
  });

  it("presents win, loss and draw from the viewer projection", () => {
    const finished = {
      roomStatus: "finished" as const,
      outcome: { winner: "first" as const, reason: "five_in_a_row" as const },
    };
    expect(omokOutcomeTitle(snapshot(finished))).toBe("승리");
    expect(
      omokOutcomeTitle(
        snapshot({
          ...finished,
          viewer: {
            role: "participant",
            slot: "second",
            capabilities: { canRematch: false },
          },
        }),
      ),
    ).toBe("패배");
    expect(
      omokOutcomeTitle(
        snapshot({
          roomStatus: "finished",
          outcome: { winner: null, reason: "draw" },
        }),
      ),
    ).toBe("무승부");
  });

  it("explains rematch authority without inferring a participant capability", () => {
    expect(omokRematchMessage(snapshot(), false)).toContain("방장이");
    const host = snapshot({
      roomStatus: "finished",
      viewer: { role: "host", slot: null, capabilities: { canRematch: true } },
    });
    expect(omokRematchMessage(host, true)).toContain("두 사람 모두");
  });
});
