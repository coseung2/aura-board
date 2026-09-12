/** Pure authoritative Omok contract: types, validation, command construction and
 * durable-pending key scoping. This module must stay free of React Native and
 * network imports so the state machine can be tested in a node environment. */
export const PLAY_COMMAND_SCHEMA_VERSION = 1 as const;
/** Realtime wire/ticket protocol version shared by the ticket route, the Rust
 * socket frames and this client. */
export const OMOK_REALTIME_PROTOCOL_VERSION = 1 as const;
/** Documented bounded HTTP recovery interval, also the bot-session default. */
export const OMOK_ACTIVE_POLL_INTERVAL_MS = 3_000;

export type OmokSlot = "first" | "second";
export type OmokCell = OmokSlot | null;
export type OmokIntent =
  | { type: "ready" }
  | { type: "place_stone"; position: { row: number; column: number } }
  | { type: "resign" };
export type OmokSnapshot = {
  sessionId: string;
  boardId: string;
  gameKind: "omok";
  version: number;
  serverTimeMs: number;
  rulesVersion: number;
  stateSchemaVersion: number;
  previousSessionId: string | null;
  roomStatus: "waiting" | "ready" | "active" | "finished";
  participants: Array<{
    displayName: string;
    slot: OmokSlot;
    ready: boolean;
  }>;
  viewer: {
    role: "host" | "participant";
    slot: OmokSlot | null;
    /** Actor-projected capabilities. `canRematch` is true only for the host of
     * a terminal session, so the UI must never infer it from role or names. */
    capabilities: { canRematch: boolean };
  };
  game: {
    board: OmokCell[];
    nextTurn: OmokSlot;
    status:
      | { status: "playing" }
      | { status: "won"; winner: OmokSlot }
      | { status: "draw" };
    moveCount: number;
    lastMove: {
      number: number;
      side: OmokSlot;
      position: { row: number; column: number };
    } | null;
  };
  outcome: {
    winner: OmokSlot | null;
    reason: "five_in_a_row" | "draw" | "resignation";
  } | null;
};
export type PlayCommandRequest = {
  requestId: string;
  expectedVersion: number;
  commandSchemaVersion: typeof PLAY_COMMAND_SCHEMA_VERSION;
  command: OmokIntent;
};
export type PlayCommandResponse = {
  requestId: string;
  previousVersion: number;
  version: number;
  snapshot: OmokSnapshot;
};
export type PlayApiError = {
  error: string;
  detail?: string;
  currentVersion?: number;
  snapshot?: OmokSnapshot;
};
export type PendingOmokCommand = {
  sessionId: string;
  request: PlayCommandRequest;
};
export type OmokMatchmakingStatus = {
  status: "idle" | "waiting" | "matched";
  playerCount: number;
  sessionId?: string;
  boardSlug?: string;
  href?: string | null;
};
/** Exactly the union the Next ticket route returns. A websocket transport is
 * the only shape that carries a ticket; a bot session is an explicit,
 * authenticated instruction to keep using the HTTP command path. */
export type OmokRealtimeTransport =
  | {
      transport: "websocket";
      protocolVersion: 1;
      websocketUrl: string;
      ticket: string;
      expiresAtMs: number;
    }
  | {
      transport: "http";
      reason: "bot_session";
      pollIntervalMs: number;
    };

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isOmokSlot(value: unknown): value is OmokSlot {
  return value === "first" || value === "second";
}

function isOmokPosition(value: unknown): value is { row: number; column: number } {
  if (!isPlainRecord(value)) return false;
  return (
    Number.isInteger(value.row) && Number(value.row) >= 0 && Number(value.row) < 15 &&
    Number.isInteger(value.column) && Number(value.column) >= 0 && Number(value.column) < 15
  );
}

export function isOmokSnapshot(value: unknown): value is OmokSnapshot {
  if (!isPlainRecord(value)) return false;
  const participants = value.participants;
  const viewer = value.viewer;
  const game = value.game;
  if (
    value.gameKind !== "omok" ||
    typeof value.sessionId !== "string" || !value.sessionId ||
    typeof value.boardId !== "string" || !value.boardId ||
    !Number.isSafeInteger(value.version) || Number(value.version) < 0 ||
    !Number.isSafeInteger(value.serverTimeMs) ||
    value.rulesVersion !== 1 || value.stateSchemaVersion !== 1 ||
    !(value.previousSessionId === null || typeof value.previousSessionId === "string") ||
    !["waiting", "ready", "active", "finished"].includes(String(value.roomStatus)) ||
    !Array.isArray(participants) || participants.length !== 2 ||
    !isPlainRecord(viewer) || !isPlainRecord(game)
  ) return false;
  const participantSlots = new Set<OmokSlot>();
  for (const participant of participants) {
    if (
      !isPlainRecord(participant) ||
      typeof participant.displayName !== "string" || !participant.displayName ||
      !isOmokSlot(participant.slot) || typeof participant.ready !== "boolean"
    ) return false;
    participantSlots.add(participant.slot);
  }
  if (participantSlots.size !== 2) return false;
  if (
    (viewer.role !== "host" && viewer.role !== "participant") ||
    !(viewer.slot === null || isOmokSlot(viewer.slot)) ||
    (viewer.role === "host" && viewer.slot !== null) ||
    (viewer.role === "participant" && !isOmokSlot(viewer.slot)) ||
    !isPlainRecord(viewer.capabilities) ||
    typeof viewer.capabilities.canRematch !== "boolean"
  ) return false;
  const board = game.board;
  if (
    !Array.isArray(board) || board.length !== 225 ||
    board.some((cell) => cell !== null && !isOmokSlot(cell)) ||
    !isOmokSlot(game.nextTurn) ||
    !Number.isSafeInteger(game.moveCount) || Number(game.moveCount) < 0 || Number(game.moveCount) > 225 ||
    board.filter((cell) => cell !== null).length !== game.moveCount ||
    !isPlainRecord(game.status)
  ) return false;
  if (
    game.status.status !== "playing" && game.status.status !== "draw" &&
    !(game.status.status === "won" && isOmokSlot(game.status.winner))
  ) return false;
  if (game.lastMove !== null) {
    if (
      !isPlainRecord(game.lastMove) || !Number.isSafeInteger(game.lastMove.number) ||
      !isOmokSlot(game.lastMove.side) || !isOmokPosition(game.lastMove.position)
    ) return false;
  }
  if (value.outcome !== null) {
    if (
      !isPlainRecord(value.outcome) ||
      !(value.outcome.winner === null || isOmokSlot(value.outcome.winner)) ||
      !["five_in_a_row", "draw", "resignation"].includes(String(value.outcome.reason))
    ) return false;
  }
  return true;
}

/** Accepts the current snapshot contract unchanged. During the rolling Rust
 * transition, the immediately previous shape is accepted only when the
 * viewer omitted `capabilities` entirely; the normalized clone must still
 * pass the current validator. Untrusted input is never mutated. */
export function parseOmokSnapshot(value: unknown): OmokSnapshot | null {
  if (isOmokSnapshot(value)) return value;
  if (!isPlainRecord(value) || !isPlainRecord(value.viewer)) return null;
  if (Object.prototype.hasOwnProperty.call(value.viewer, "capabilities")) return null;

  const normalized: unknown = {
    ...value,
    viewer: {
      ...value.viewer,
      capabilities: { canRematch: false },
    },
  };
  return isOmokSnapshot(normalized) ? normalized : null;
}

export function isPlayCommandResponse(value: unknown): value is PlayCommandResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<PlayCommandResponse>;
  return (
    typeof response.requestId === "string" &&
    Number.isSafeInteger(response.previousVersion) &&
    Number.isSafeInteger(response.version) &&
    isOmokSnapshot(response.snapshot) &&
    response.version === response.snapshot.version
  );
}

/** Parses an HTTP command envelope while preserving request/version
 * correlation and applying the same snapshot compatibility boundary. */
export function parsePlayCommandResponse(value: unknown): PlayCommandResponse | null {
  if (!isPlainRecord(value)) return null;
  const snapshot = parseOmokSnapshot(value.snapshot);
  if (
    typeof value.requestId !== "string" ||
    !Number.isSafeInteger(value.previousVersion) ||
    !Number.isSafeInteger(value.version) ||
    !snapshot ||
    value.version !== snapshot.version
  ) return null;
  return {
    requestId: value.requestId,
    previousVersion: Number(value.previousVersion),
    version: Number(value.version),
    snapshot,
  };
}

/** Parses the ticket route's documented union. Anything else — a partial body,
 * an unknown transport, a non-bot HTTP reason — is a protocol violation and
 * must not be reinterpreted as a transport choice. */
export function parseOmokRealtimeTransport(
  value: unknown,
): OmokRealtimeTransport | null {
  if (!isPlainRecord(value)) return null;
  if (value.transport === "websocket") {
    if (
      value.protocolVersion !== OMOK_REALTIME_PROTOCOL_VERSION ||
      typeof value.websocketUrl !== "string" ||
      !/^wss?:\/\//.test(value.websocketUrl) ||
      typeof value.ticket !== "string" || value.ticket.length === 0 ||
      !Number.isSafeInteger(value.expiresAtMs) || Number(value.expiresAtMs) <= 0
    ) return null;
    return {
      transport: "websocket",
      protocolVersion: OMOK_REALTIME_PROTOCOL_VERSION,
      websocketUrl: value.websocketUrl,
      ticket: value.ticket,
      expiresAtMs: Number(value.expiresAtMs),
    };
  }
  if (value.transport === "http") {
    if (
      value.reason !== "bot_session" ||
      value.pollIntervalMs !== OMOK_ACTIVE_POLL_INTERVAL_MS
    ) return null;
    return {
      transport: "http",
      reason: "bot_session",
      pollIntervalMs: OMOK_ACTIVE_POLL_INTERVAL_MS,
    };
  }
  return null;
}

export function makeOmokCommand(
  snapshot: OmokSnapshot,
  command: OmokIntent,
): PlayCommandRequest {
  return {
    requestId: createRequestId(command.type),
    expectedVersion: snapshot.version,
    commandSchemaVersion: PLAY_COMMAND_SCHEMA_VERSION,
    command,
  };
}

/** The server-owned Omok bot plays through the Next HTTP command route, so a
 * bot session must stay on the documented HTTP transport. */
export const OMOK_BOT_DISPLAY_NAME = "오목봇";

export function isOmokBotSession(snapshot: OmokSnapshot): boolean {
  return snapshot.participants.some(
    (participant) =>
      participant.slot !== snapshot.viewer.slot &&
      participant.displayName === OMOK_BOT_DISPLAY_NAME,
  );
}

/** Legacy board-scoped key. Read once for migration, then removed. */
export function legacyPendingOmokKey(boardId: string): string {
  return `omok_pending_${boardId}`;
}

/** Durable pending is scoped by session and command type so a resign cannot
 * overwrite an unconfirmed stone. SecureStore keys allow only alphanumerics,
 * `.`, `-` and `_`, so the session id is sanitized. */
export function pendingOmokKey(
  sessionId: string,
  commandType: OmokIntent["type"],
): string {
  return `omok_pending_${sessionId.replace(/[^A-Za-z0-9._-]/g, "_")}_${commandType}`;
}

/** Durable payloads must preserve requestId, expectedVersion and command so
 * receipt replay still applies after a restart. */
export function parsePendingOmokCommand(raw: string | null): PendingOmokCommand | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PendingOmokCommand;
    if (
      !value ||
      typeof value.sessionId !== "string" || !value.sessionId ||
      typeof value.request?.requestId !== "string" ||
      !Number.isSafeInteger(value.request.expectedVersion) ||
      value.request.commandSchemaVersion !== PLAY_COMMAND_SCHEMA_VERSION ||
      !isPlainRecord(value.request.command) ||
      typeof value.request.command.type !== "string"
    ) return null;
    return value;
  } catch {
    return null;
  }
}

function createRequestId(prefix: string): string {
  const cryptoValue = globalThis.crypto as { randomUUID?: () => string } | undefined;
  const uuid = cryptoValue?.randomUUID?.();
  return uuid
    ? `${prefix}.${uuid}`
    : `${prefix}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`;
}
