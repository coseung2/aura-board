import * as SecureStore from "expo-secure-store";
import { apiFetch, ApiError } from "./api";
import {
  legacyPendingOmokKey,
  parseOmokSnapshot,
  parsePlayCommandResponse,
  parseOmokRealtimeTransport,
  parsePendingOmokCommand,
  pendingOmokKey,
  type OmokIntent,
  type OmokMatchmakingStatus,
  type OmokRealtimeTransport,
  type OmokSnapshot,
  type PendingOmokCommand,
  type PlayApiError,
  type PlayCommandRequest,
  type PlayCommandResponse,
} from "./omok-contract";

// The pure contract — types, validation, command construction and durable
// pending key scoping — lives in ./omok-contract so the state machine and its
// node-environment tests never import React Native. This module owns the
// network and SecureStore IO built on top of it.
export * from "./omok-contract";

export async function fetchCurrentOmokSession(
  boardId: string,
): Promise<OmokSnapshot | null> {
  try {
    const value = await apiFetch<unknown>(
      `/api/play/boards/${encodeURIComponent(boardId)}/session`,
      { timeoutMs: 5_000 },
    );
    const snapshot = parseOmokSnapshot(value);
    if (!snapshot) throw new Error("invalid_omok_snapshot");
    return snapshot;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function fetchOmokMatchmaking(
  boardId: string,
): Promise<OmokMatchmakingStatus> {
  return apiFetch<OmokMatchmakingStatus>(
    `/api/play/boards/${encodeURIComponent(boardId)}/matchmaking`,
    { timeoutMs: 5_000, forceRefresh: true },
  );
}

export async function requestOmokMatch(
  boardId: string,
  opponent: "human" | "computer" = "human",
): Promise<OmokMatchmakingStatus> {
  return apiFetch<OmokMatchmakingStatus>(
    `/api/play/boards/${encodeURIComponent(boardId)}/matchmaking`,
    { method: "POST", json: { opponent }, timeoutMs: 8_000 },
  );
}

export async function cancelOmokMatch(
  boardId: string,
): Promise<OmokMatchmakingStatus> {
  return apiFetch<OmokMatchmakingStatus>(
    `/api/play/boards/${encodeURIComponent(boardId)}/matchmaking`,
    { method: "DELETE", timeoutMs: 5_000 },
  );
}

export async function submitOmokCommand(
  sessionId: string,
  request: PlayCommandRequest,
): Promise<PlayCommandResponse> {
  const value = await apiFetch<unknown>(
    `/api/play/sessions/${encodeURIComponent(sessionId)}/commands`,
    { method: "POST", json: request, timeoutMs: 5_000 },
  );
  const response = parsePlayCommandResponse(value);
  if (!response || response.requestId !== request.requestId) {
    throw new Error("invalid_play_command_response");
  }
  return response;
}

/** Host-only rematch. The engine replies with the replacement session. */
export async function requestOmokRematch(
  sessionId: string,
  requestId: string,
): Promise<OmokSnapshot> {
  const value = await apiFetch<unknown>(
    `/api/play/sessions/${encodeURIComponent(sessionId)}/rematch`,
    { method: "POST", json: { requestId }, timeoutMs: 8_000 },
  );
  const directSnapshot = parseOmokSnapshot(value);
  if (directSnapshot) return directSnapshot;
  const snapshot = parseOmokSnapshot(
    (value as { snapshot?: unknown } | null)?.snapshot,
  );
  if (snapshot) return snapshot;
  throw new Error("invalid_omok_rematch_response");
}

/**
 * A session-bound realtime ticket for the Rust game socket. The route is
 * optional during rollout: when it is absent or the actor is not eligible, the
 * caller keeps using the documented HTTP command path.
 */
export async function fetchOmokRealtimeTicket(
  sessionId: string,
): Promise<OmokRealtimeTransport> {
  const value = await apiFetch<unknown>(
    `/api/play/sessions/${encodeURIComponent(sessionId)}/realtime-ticket`,
    { method: "POST", json: {}, timeoutMs: 5_000, retry: 0 },
  );
  const transport = parseOmokRealtimeTransport(value);
  if (!transport) throw new Error("invalid_omok_realtime_transport");
  return transport;
}

export async function loadPendingOmokCommand(
  sessionId: string,
  commandType: OmokIntent["type"],
): Promise<PendingOmokCommand | null> {
  try {
    const value = parsePendingOmokCommand(
      await SecureStore.getItemAsync(pendingOmokKey(sessionId, commandType)),
    );
    if (!value) return null;
    if (value.sessionId !== sessionId || value.request.command.type !== commandType) {
      await clearPendingOmokCommand(sessionId, commandType);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export async function savePendingOmokCommand(
  pending: PendingOmokCommand,
): Promise<void> {
  await SecureStore.setItemAsync(
    pendingOmokKey(pending.sessionId, pending.request.command.type),
    JSON.stringify(pending),
  );
}

export async function clearPendingOmokCommand(
  sessionId: string,
  commandType: OmokIntent["type"],
): Promise<void> {
  await SecureStore.deleteItemAsync(pendingOmokKey(sessionId, commandType));
}

/**
 * Move a pending command written by the previous board-scoped key into the
 * session+commandType scope exactly once, preserving requestId, expectedVersion
 * and payload so receipt replay still applies.
 */
export async function migrateLegacyPendingOmokCommand(
  boardId: string,
): Promise<PendingOmokCommand | null> {
  const legacyKey = legacyPendingOmokKey(boardId);
  try {
    const raw = await SecureStore.getItemAsync(legacyKey);
    if (raw === null) return null;
    const value = parsePendingOmokCommand(raw);
    if (value) await savePendingOmokCommand(value);
    await SecureStore.deleteItemAsync(legacyKey);
    return value;
  } catch {
    return null;
  }
}

export function playApiError(error: unknown): PlayApiError | null {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== "object") {
    return null;
  }
  return error.body as PlayApiError;
}
