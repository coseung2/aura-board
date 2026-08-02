import type { AudioSource } from "expo-audio";
import * as SecureStore from "expo-secure-store";
import { ApiError, apiFetch, getApiUrl } from "./api";
import { loadSessionToken } from "./session";
import {
  isSongGuessCommandResponse,
  isSongGuessSnapshot,
  type SongGuessApiError,
  type SongGuessCommandRequest,
  type SongGuessCommandResponse,
  type SongGuessSnapshot,
} from "./song-guess-contract";

export type PendingSongGuessCommand = {
  sessionId: string;
  request: SongGuessCommandRequest;
};

function pendingKey(boardId: string): string {
  return `aura.songGuess.pending.${boardId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

export async function fetchCurrentSongGuessSession(
  boardId: string,
): Promise<SongGuessSnapshot | null> {
  try {
    const value = await apiFetch<unknown>(
      `/api/song-guess/boards/${encodeURIComponent(boardId)}/session`,
      { timeoutMs: 10_000 },
    );
    if (!isSongGuessSnapshot(value)) throw new Error("invalid_song_guess_snapshot");
    return value;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function submitSongGuessCommand(
  sessionId: string,
  request: SongGuessCommandRequest,
): Promise<SongGuessCommandResponse> {
  const value = await apiFetch<unknown>(
    `/api/song-guess/sessions/${encodeURIComponent(sessionId)}/commands`,
    { method: "POST", json: request, timeoutMs: 10_000 },
  );
  if (!isSongGuessCommandResponse(value) || value.requestId !== request.requestId) {
    throw new Error("invalid_song_guess_command_response");
  }
  return value;
}

export async function loadSongGuessAudioSource(
  sessionId: string,
  assetId: string,
): Promise<AudioSource> {
  const token = await loadSessionToken();
  if (!token) throw new ApiError(401, { error: "unauthorized" });
  return {
    uri: getApiUrl(
      `/api/song-guess/sessions/${encodeURIComponent(sessionId)}/clips/${encodeURIComponent(assetId)}`,
    ),
    headers: { Authorization: `Bearer ${token}` },
  };
}

export async function loadPendingSongGuessCommand(
  boardId: string,
): Promise<PendingSongGuessCommand | null> {
  const raw = await SecureStore.getItemAsync(pendingKey(boardId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PendingSongGuessCommand;
    if (
      !value ||
      typeof value.sessionId !== "string" ||
      !value.sessionId ||
      !value.request ||
      typeof value.request.requestId !== "string" ||
      !Number.isSafeInteger(value.request.expectedVersion) ||
      value.request.commandSchemaVersion !== 1 ||
      value.request.command?.type !== "guess" ||
      typeof value.request.command.text !== "string"
    ) {
      await clearPendingSongGuessCommand(boardId);
      return null;
    }
    return value;
  } catch {
    await clearPendingSongGuessCommand(boardId).catch(() => undefined);
    return null;
  }
}

export async function savePendingSongGuessCommand(
  boardId: string,
  pending: PendingSongGuessCommand,
): Promise<void> {
  await SecureStore.setItemAsync(pendingKey(boardId), JSON.stringify(pending));
}

export async function clearPendingSongGuessCommand(boardId: string): Promise<void> {
  await SecureStore.deleteItemAsync(pendingKey(boardId));
}

export function songGuessApiError(error: unknown): SongGuessApiError | null {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== "object") return null;
  return error.body as SongGuessApiError;
}
