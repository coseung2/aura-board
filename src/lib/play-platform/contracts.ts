export const PLAY_COMMAND_SCHEMA_VERSION = 1 as const;
export const PLAY_SESSION_STATE_SCHEMA_VERSION = 1 as const;
export const OMOK_RULES_VERSION = 1 as const;
export const PLAY_SESSION_CHANGED_EVENT = "play_session_changed" as const;

export type PlayActorRole = "host" | "participant";
export type OmokSlot = "first" | "second";
export type OmokRoomStatus = "waiting" | "ready" | "active" | "finished";
export type OmokCell = OmokSlot | null;

export type OmokPosition = { row: number; column: number };
export type OmokMove = {
  number: number;
  side: OmokSlot;
  position: OmokPosition;
};
export type OmokStatus =
  | { status: "playing" }
  | { status: "won"; winner: OmokSlot }
  | { status: "draw" };
export type OmokState = {
  board: OmokCell[];
  nextTurn: OmokSlot;
  status: OmokStatus;
  moveCount: number;
  lastMove: OmokMove | null;
};
export type OmokOutcome = {
  winner: OmokSlot | null;
  reason: "five_in_a_row" | "draw" | "resignation";
};
export type OmokParticipant = {
  displayName: string;
  slot: OmokSlot;
  ready: boolean;
};
export type OmokSnapshot = {
  sessionId: string;
  boardId: string;
  gameKind: "omok";
  version: number;
  serverTimeMs: number;
  rulesVersion: number;
  stateSchemaVersion: number;
  previousSessionId: string | null;
  roomStatus: OmokRoomStatus;
  participants: OmokParticipant[];
  viewer: { role: PlayActorRole; slot: OmokSlot | null };
  game: OmokState;
  outcome: OmokOutcome | null;
};

export type OmokIntent =
  | { type: "ready" }
  | { type: "start" }
  | { type: "place_stone"; position: OmokPosition }
  | { type: "resign" };

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
export type PlaySessionResponse = {
  requestId: string;
  snapshot: OmokSnapshot;
};
export type PlayApiError = {
  error: string;
  detail?: string;
  currentVersion?: number;
  snapshot?: OmokSnapshot;
};
export type OmokRosterStudent = {
  id: string;
  name: string;
  number: number | null;
};

export type OmokMatchmakingStatus = {
  status: "idle" | "waiting" | "matched";
  playerCount: number;
  sessionId?: string;
  href?: string | null;
};

export type OmokPlayerProfile = {
  studentId: string;
  slot: OmokSlot;
  name: string;
  number: number | null;
  pet: {
    color: string;
    growthStage: number;
    equippedFloor: string;
  } | null;
  record: { wins: number; losses: number; draws: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isOmokSlot(value: unknown): value is OmokSlot {
  return value === "first" || value === "second";
}

function isOmokPosition(value: unknown): value is OmokPosition {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value.row) &&
    Number.isInteger(value.column) &&
    Number(value.row) >= 0 &&
    Number(value.row) < 15 &&
    Number(value.column) >= 0 &&
    Number(value.column) < 15
  );
}

export function isOmokSnapshot(value: unknown): value is OmokSnapshot {
  if (!isRecord(value)) return false;
  const participants = value.participants;
  const viewer = value.viewer;
  const game = value.game;
  if (
    value.gameKind !== "omok" ||
    typeof value.sessionId !== "string" || !value.sessionId ||
    typeof value.boardId !== "string" || !value.boardId ||
    !Number.isSafeInteger(value.version) || Number(value.version) < 0 ||
    !Number.isSafeInteger(value.serverTimeMs) ||
    value.rulesVersion !== OMOK_RULES_VERSION ||
    value.stateSchemaVersion !== PLAY_SESSION_STATE_SCHEMA_VERSION ||
    !(value.previousSessionId === null || typeof value.previousSessionId === "string") ||
    !["waiting", "ready", "active", "finished"].includes(String(value.roomStatus)) ||
    !Array.isArray(participants) || participants.length !== 2 ||
    !isRecord(viewer) || !isRecord(game)
  ) return false;

  const participantSlots = new Set<OmokSlot>();
  for (const participant of participants) {
    if (
      !isRecord(participant) ||
      typeof participant.displayName !== "string" || !participant.displayName ||
      !isOmokSlot(participant.slot) ||
      typeof participant.ready !== "boolean"
    ) return false;
    participantSlots.add(participant.slot);
  }
  if (participantSlots.size !== 2) return false;
  if (
    (viewer.role !== "host" && viewer.role !== "participant") ||
    !(viewer.slot === null || isOmokSlot(viewer.slot)) ||
    (viewer.role === "host" && viewer.slot !== null) ||
    (viewer.role === "participant" && !isOmokSlot(viewer.slot))
  ) return false;

  const board = game.board;
  if (
    !Array.isArray(board) ||
    board.length !== 225 ||
    board.some((cell) => cell !== null && !isOmokSlot(cell)) ||
    !isOmokSlot(game.nextTurn) ||
    !Number.isSafeInteger(game.moveCount) ||
    Number(game.moveCount) < 0 || Number(game.moveCount) > 225 ||
    board.filter((cell) => cell !== null).length !== game.moveCount ||
    !isRecord(game.status)
  ) return false;
  if (
    game.status.status !== "playing" &&
    game.status.status !== "draw" &&
    !(game.status.status === "won" && isOmokSlot(game.status.winner))
  ) return false;
  if (game.lastMove !== null) {
    if (
      !isRecord(game.lastMove) ||
      !Number.isSafeInteger(game.lastMove.number) ||
      !isOmokSlot(game.lastMove.side) ||
      !isOmokPosition(game.lastMove.position)
    ) return false;
  }
  if (value.outcome !== null) {
    if (
      !isRecord(value.outcome) ||
      !(value.outcome.winner === null || isOmokSlot(value.outcome.winner)) ||
      !["five_in_a_row", "draw", "resignation"].includes(String(value.outcome.reason))
    ) return false;
  }
  return true;
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

/** Never let a delayed response roll a session back or resurrect an old match. */
export function mergeOmokCommandSnapshot(
  current: OmokSnapshot | null,
  commandSessionId: string,
  candidate: OmokSnapshot,
): OmokSnapshot | null {
  if (candidate.sessionId !== commandSessionId) return current;
  if (current?.sessionId !== commandSessionId) return current ?? candidate;
  return candidate.version >= current.version ? candidate : current;
}

export function createPlayRequestId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}.${uuid}`;
  return `${prefix}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`;
}
