import type { OmokCommandRejectedFrame, OmokCommandCommittedFrame, OmokServerFrame } from "./omok-protocol";
import type { OmokIntent, OmokSlot, OmokSnapshot, PlayCommandRequest } from "./omok-contract";

/** Local-only aim marker. It is never sent and never treated as authority. */
export type OmokAim = { row: number; column: number };

export type OmokPendingPhase = "sending" | "confirming";

export type OmokPending = {
  sessionId: string;
  request: PlayCommandRequest;
  /** Optimistic stone position/color for `place_stone`, absent otherwise. */
  stone: { position: OmokAim; slot: OmokSlot } | null;
  phase: OmokPendingPhase;
};

export type OmokMachineState = {
  snapshot: OmokSnapshot | null;
  aim: OmokAim | null;
  pending: OmokPending | null;
  error: string | null;
};

/** Side effects the caller must perform after a transition. Returning them
 * keeps the reducer pure and testable in the node Vitest environment. */
export type OmokEffect =
  | { type: "persist_pending"; pending: OmokPending }
  | { type: "clear_pending"; sessionId: string; commandType: OmokIntent["type"] }
  | { type: "send"; pending: OmokPending }
  | { type: "placement_feedback" }
  | { type: "session_replaced"; previousSessionId: string | null; sessionId: string };

export type OmokTransition = { state: OmokMachineState; effects: OmokEffect[] };

export const initialOmokMachineState: OmokMachineState = {
  snapshot: null,
  aim: null,
  pending: null,
  error: null,
};

const BOARD_SIZE = 15;

function indexOf(position: OmokAim): number {
  return position.row * BOARD_SIZE + position.column;
}

export function isTerminalSnapshot(snapshot: OmokSnapshot | null): boolean {
  return snapshot?.roomStatus === "finished";
}

/** A participant may only aim/confirm on their own turn in an active game. */
export function canPlaceStone(snapshot: OmokSnapshot | null): boolean {
  return (
    !!snapshot &&
    snapshot.viewer.role === "participant" &&
    snapshot.roomStatus === "active" &&
    snapshot.game.status.status === "playing" &&
    snapshot.viewer.slot === snapshot.game.nextTurn
  );
}

export function isEmptyIntersection(
  snapshot: OmokSnapshot | null,
  position: OmokAim,
): boolean {
  if (!snapshot) return false;
  if (
    position.row < 0 || position.row >= BOARD_SIZE ||
    position.column < 0 || position.column >= BOARD_SIZE
  ) return false;
  return snapshot.game.board[indexOf(position)] === null;
}

function samePosition(a: OmokAim | null, b: OmokAim | null): boolean {
  return !!a && !!b && a.row === b.row && a.column === b.column;
}

/** Optimistic board projection. The pending stone is rendered from the
 * authoritative snapshot plus one local cell, never persisted as authority. */
export function projectPendingBoard(state: OmokMachineState): OmokSnapshot["game"]["board"] | null {
  const board = state.snapshot?.game.board;
  if (!board) return null;
  const stone = state.pending?.stone;
  if (!stone || state.pending?.sessionId !== state.snapshot?.sessionId) return board;
  const index = indexOf(stone.position);
  if (board[index] !== null) return board;
  const next = board.slice();
  next[index] = stone.slot;
  return next;
}

/**
 * The single per-session version reducer. Every snapshot source — ready,
 * generic snapshot, HTTP refresh, command acknowledgement, rejection — passes
 * through here, so a delayed lower version can never roll back rendered state.
 *
 * `replacesSession` is reserved for explicit host rematch replacement and
 * current-session HTTP discovery; a foreign sessionId is otherwise ignored.
 */
export function mergeSnapshot(
  state: OmokMachineState,
  candidate: OmokSnapshot,
  options: { replacesSession?: boolean } = {},
): { state: OmokMachineState; applied: boolean; replaced: boolean } {
  const current = state.snapshot;
  if (!current) {
    return { state: { ...state, snapshot: candidate }, applied: true, replaced: false };
  }
  if (candidate.sessionId !== current.sessionId) {
    if (!options.replacesSession) {
      return { state, applied: false, replaced: false };
    }
    return {
      state: { ...state, snapshot: candidate, aim: null, pending: null, error: null },
      applied: true,
      replaced: true,
    };
  }
  // Higher versions converge even when intermediate versions were missed.
  if (candidate.version <= current.version) {
    return { state, applied: false, replaced: false };
  }
  const aimStillLegal =
    state.aim && candidate.game.board[indexOf(state.aim)] === null ? state.aim : null;
  return {
    state: { ...state, snapshot: candidate, aim: aimStillLegal },
    applied: true,
    replaced: false,
  };
}

/** Does this committed frame prove our own pending command? */
function correlates(pending: OmokPending, frame: OmokCommandCommittedFrame): boolean {
  return (
    pending.sessionId === frame.sessionId &&
    pending.request.requestId === frame.requestId &&
    pending.request.command.type === frame.commandType
  );
}

export function ingestSnapshot(
  state: OmokMachineState,
  candidate: OmokSnapshot,
  options: { replacesSession?: boolean } = {},
): OmokTransition {
  const previousSessionId = state.snapshot?.sessionId ?? null;
  const merged = mergeSnapshot(state, candidate, options);
  const effects: OmokEffect[] = [];
  if (merged.replaced) {
    // The superseded intent scope must not leak into the new session.
    if (state.pending) {
      effects.push({
        type: "clear_pending",
        sessionId: state.pending.sessionId,
        commandType: state.pending.request.command.type,
      });
    }
    effects.push({
      type: "session_replaced",
      previousSessionId,
      sessionId: candidate.sessionId,
    });
  }
  return { state: merged.state, effects };
}

/** First tap: snap the aim marker and announce it without sending anything. */
export function aimAt(state: OmokMachineState, position: OmokAim): OmokTransition {
  if (state.pending || !canPlaceStone(state.snapshot)) return { state, effects: [] };
  if (!isEmptyIntersection(state.snapshot, position)) {
    return { state: { ...state, error: "이미 돌이 놓인 자리예요." }, effects: [] };
  }
  return { state: { ...state, aim: position, error: null }, effects: [] };
}

export function clearAim(state: OmokMachineState): OmokTransition {
  return { state: { ...state, aim: null, error: null }, effects: [] };
}

/**
 * Confirm the aimed intersection. The caller must already hold the synchronous
 * submit lock; this returns the pending stone in the same transition so the
 * board paints before persistence or network work begins.
 */
export function confirmAim(
  state: OmokMachineState,
  makeRequest: (snapshot: OmokSnapshot, command: OmokIntent) => PlayCommandRequest,
): OmokTransition {
  const snapshot = state.snapshot;
  const aim = state.aim;
  if (!snapshot || !aim || state.pending || !canPlaceStone(snapshot)) {
    return { state, effects: [] };
  }
  if (!isEmptyIntersection(snapshot, aim)) {
    return { state: { ...state, aim: null, error: "이미 돌이 놓인 자리예요." }, effects: [] };
  }
  const slot = snapshot.viewer.slot;
  if (!slot) return { state, effects: [] };
  const pending: OmokPending = {
    sessionId: snapshot.sessionId,
    request: makeRequest(snapshot, { type: "place_stone", position: aim }),
    stone: { position: aim, slot },
    phase: "sending",
  };
  return {
    state: { ...state, aim: null, pending, error: null },
    effects: [
      { type: "placement_feedback" },
      { type: "persist_pending", pending },
      { type: "send", pending },
    ],
  };
}

/** Non-placement intents (ready, resign) share the pending/durable contract. */
export function startIntent(
  state: OmokMachineState,
  command: Exclude<OmokIntent, { type: "place_stone" }>,
  makeRequest: (snapshot: OmokSnapshot, command: OmokIntent) => PlayCommandRequest,
): OmokTransition {
  const snapshot = state.snapshot;
  if (!snapshot || state.pending || isTerminalSnapshot(snapshot)) {
    return { state, effects: [] };
  }
  const pending: OmokPending = {
    sessionId: snapshot.sessionId,
    request: makeRequest(snapshot, command),
    stone: null,
    phase: "sending",
  };
  return {
    state: { ...state, aim: null, pending, error: null },
    effects: [
      { type: "persist_pending", pending },
      { type: "send", pending },
    ],
  };
}

/** Restore a durable pending command after a restart or background return. */
export function adoptPending(
  state: OmokMachineState,
  pending: OmokPending,
): OmokTransition {
  if (state.pending || pending.sessionId !== state.snapshot?.sessionId) {
    return { state, effects: [] };
  }
  const command = pending.request.command;
  const slot = state.snapshot.viewer.slot;
  const stone =
    command.type === "place_stone" && slot
      ? { position: command.position, slot }
      : pending.stone;
  const restored: OmokPending = { ...pending, stone, phase: "confirming" };
  return {
    state: { ...state, pending: restored, error: null },
    effects: [{ type: "send", pending: restored }],
  };
}

export function applyCommitted(
  state: OmokMachineState,
  frame: OmokCommandCommittedFrame,
): OmokTransition {
  const pending = state.pending;
  const correlated = !!pending && correlates(pending, frame);
  const merged = mergeSnapshot(state, frame.snapshot);
  const effects: OmokEffect[] = [];
  let next = merged.state;

  if (correlated && pending) {
    // A correlated commit settles the pending even when its snapshot version is
    // already superseded; the board itself never rolls back because the merge
    // above rejected the older version.
    next = { ...next, pending: null, error: null };
    effects.push({
      type: "clear_pending",
      sessionId: pending.sessionId,
      commandType: pending.request.command.type,
    });
  }
  return { state: next, effects };
}

export function applyRejection(
  state: OmokMachineState,
  frame: OmokCommandRejectedFrame,
): OmokTransition {
  const pending = state.pending;
  const correlated =
    !!pending &&
    pending.sessionId === frame.sessionId &&
    pending.request.requestId === frame.requestId &&
    pending.request.command.type === frame.commandType;
  const effects: OmokEffect[] = [];
  let next = state;

  if (frame.snapshot) {
    next = mergeSnapshot(next, frame.snapshot).state;
  }
  if (correlated && pending && !frame.retryable) {
    next = { ...next, pending: null, error: omokRejectionMessage(frame.error) };
    effects.push({
      type: "clear_pending",
      sessionId: pending.sessionId,
      commandType: pending.request.command.type,
    });
  }
  return { state: next, effects };
}

/** An acknowledgement timeout is not a failure. Input stays locked and the
 * same requestId is replayed until authority answers. */
export function markPendingUnconfirmed(state: OmokMachineState): OmokTransition {
  const pending = state.pending;
  if (!pending) return { state, effects: [] };
  const confirming: OmokPending = { ...pending, phase: "confirming" };
  return {
    state: { ...state, pending: confirming, error: null },
    effects: [{ type: "send", pending: confirming }],
  };
}

export function setError(state: OmokMachineState, error: string | null): OmokTransition {
  return { state: { ...state, error }, effects: [] };
}

export function omokRejectionMessage(error: string): string {
  switch (error) {
    case "version_conflict":
      return "상대가 먼저 두어서 최신 판으로 맞췄어요.";
    case "domain_rejected":
      return "그 자리는 둘 수 없거나 내 차례가 아니에요.";
    case "invalid_phase":
      return "지금 단계에서는 그 동작을 할 수 없어요.";
    case "forbidden":
      return "이 대국에 참여할 권한이 없어요.";
    default:
      return "요청을 처리하지 못했어요. 최신 상태를 확인해 주세요.";
  }
}

/** Convenience wrapper for socket frames that carry snapshot state. */
export function applyServerFrame(
  state: OmokMachineState,
  frame: OmokServerFrame,
): OmokTransition {
  switch (frame.type) {
    case "ready":
      return ingestSnapshot(state, frame.snapshot);
    case "snapshot":
      return ingestSnapshot(state, frame.snapshot);
    case "command_committed":
      return applyCommitted(state, frame);
    case "command_rejected":
      return applyRejection(state, frame);
    case "connection_error":
      return { state, effects: [] };
    case "session_replaced":
      if (state.snapshot?.sessionId !== frame.previousSessionId) {
        return { state, effects: [] };
      }
      return ingestSnapshot(state, frame.snapshot, { replacesSession: true });
  }
}

export { samePosition as isSameOmokPosition };
