import * as SecureStore from "expo-secure-store";
import { apiFetch, ApiError } from "./api";

export const PLAY_COMMAND_SCHEMA_VERSION = 1 as const;

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
  viewer: { role: "host" | "participant"; slot: OmokSlot | null };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isOmokSlot(value: unknown): value is OmokSlot {
  return value === "first" || value === "second";
}

function isOmokPosition(value: unknown): value is { row: number; column: number } {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value.row) && Number(value.row) >= 0 && Number(value.row) < 15 &&
    Number.isInteger(value.column) && Number(value.column) >= 0 && Number(value.column) < 15
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
    value.rulesVersion !== 1 || value.stateSchemaVersion !== 1 ||
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
      !isOmokSlot(participant.slot) || typeof participant.ready !== "boolean"
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
    !Array.isArray(board) || board.length !== 225 ||
    board.some((cell) => cell !== null && !isOmokSlot(cell)) ||
    !isOmokSlot(game.nextTurn) ||
    !Number.isSafeInteger(game.moveCount) || Number(game.moveCount) < 0 || Number(game.moveCount) > 225 ||
    board.filter((cell) => cell !== null).length !== game.moveCount ||
    !isRecord(game.status)
  ) return false;
  if (
    game.status.status !== "playing" && game.status.status !== "draw" &&
    !(game.status.status === "won" && isOmokSlot(game.status.winner))
  ) return false;
  if (game.lastMove !== null) {
    if (
      !isRecord(game.lastMove) || !Number.isSafeInteger(game.lastMove.number) ||
      !isOmokSlot(game.lastMove.side) || !isOmokPosition(game.lastMove.position)
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

export function mergeOmokCommandSnapshot(
  current: OmokSnapshot | null,
  commandSessionId: string,
  candidate: OmokSnapshot,
): OmokSnapshot | null {
  if (candidate.sessionId !== commandSessionId) return current;
  if (current?.sessionId !== commandSessionId) return current ?? candidate;
  return candidate.version >= current.version ? candidate : current;
}

export async function fetchCurrentOmokSession(
  boardId: string,
): Promise<OmokSnapshot | null> {
  try {
    const value = await apiFetch<unknown>(
      `/api/play/boards/${encodeURIComponent(boardId)}/session`,
      { timeoutMs: 5_000 },
    );
    if (!isOmokSnapshot(value)) throw new Error("invalid_omok_snapshot");
    return value;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
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

export async function submitOmokCommand(
  sessionId: string,
  request: PlayCommandRequest,
): Promise<PlayCommandResponse> {
  const value = await apiFetch<unknown>(
    `/api/play/sessions/${encodeURIComponent(sessionId)}/commands`,
    { method: "POST", json: request, timeoutMs: 5_000 },
  );
  if (!isPlayCommandResponse(value) || value.requestId !== request.requestId) {
    throw new Error("invalid_play_command_response");
  }
  return value;
}

export function pendingOmokKey(boardId: string): string {
  return `omok_pending_${boardId}`;
}

export async function loadPendingOmokCommand(
  boardId: string,
): Promise<PendingOmokCommand | null> {
  try {
    const raw = await SecureStore.getItemAsync(pendingOmokKey(boardId));
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingOmokCommand;
    if (
      !value ||
      typeof value.sessionId !== "string" ||
      typeof value.request?.requestId !== "string" ||
      !Number.isSafeInteger(value.request.expectedVersion)
    ) {
      await clearPendingOmokCommand(boardId);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export async function savePendingOmokCommand(
  boardId: string,
  pending: PendingOmokCommand,
): Promise<void> {
  await SecureStore.setItemAsync(pendingOmokKey(boardId), JSON.stringify(pending));
}

export async function clearPendingOmokCommand(boardId: string): Promise<void> {
  await SecureStore.deleteItemAsync(pendingOmokKey(boardId));
}

export function playApiError(error: unknown): PlayApiError | null {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== "object") {
    return null;
  }
  return error.body as PlayApiError;
}

function createRequestId(prefix: string): string {
  const cryptoValue = globalThis.crypto as { randomUUID?: () => string } | undefined;
  const uuid = cryptoValue?.randomUUID?.();
  return uuid
    ? `${prefix}.${uuid}`
    : `${prefix}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`;
}
