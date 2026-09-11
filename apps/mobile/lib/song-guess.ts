import type { AudioSource } from "expo-audio";
import * as SecureStore from "expo-secure-store";
import { ApiError, apiFetch, getApiUrl } from "./api";
import { loadSessionToken } from "./session";
import {
  SONG_GUESS_COMMAND_SCHEMA_VERSION,
  isSongGuessCommandResponse,
  isSongGuessIntent,
  isSongGuessSnapshot,
  type SongGuessApiError,
  type SongGuessCommandRequest,
  type SongGuessCommandResponse,
  type SongGuessPhase,
  type SongGuessSnapshot,
} from "./song-guess-contract";

/**
 * Returns the server-clock time left in a v2 round. Legacy snapshots do not
 * have a deadline, so callers should keep the legacy UI when this is null.
 * `serverNowMs` must be estimated from the snapshot's server time and a
 * monotonic clock; it is never used to authorize or score a guess.
 */
export function songGuessRemainingMs(
  snapshot: SongGuessSnapshot,
  serverNowMs: number,
): number | null {
  if (snapshot.rulesVersion !== 2 || snapshot.phase !== "guessing") return null;
  const deadlineAtMs = snapshot.currentRound.deadlineAtMs;
  if (
    typeof deadlineAtMs !== "number" ||
    !Number.isSafeInteger(deadlineAtMs) ||
    !Number.isFinite(serverNowMs)
  )
    return null;
  return Math.max(0, deadlineAtMs - serverNowMs);
}

export function songGuessRemainingSeconds(
  snapshot: SongGuessSnapshot,
  serverNowMs: number,
): number | null {
  const remainingMs = songGuessRemainingMs(snapshot, serverNowMs);
  return remainingMs === null ? null : Math.ceil(remainingMs / 1_000);
}

/**
 * A display-only score estimate for v2. The command response is authoritative
 * because network delay and the server's clock determine the actual score.
 */
export function songGuessScorePreview(
  snapshot: SongGuessSnapshot,
  serverNowMs: number,
): number | null {
  const remainingMs = songGuessRemainingMs(snapshot, serverNowMs);
  if (remainingMs === null) return null;
  if (remainingMs <= 0) return 0;
  const startedAtMs = snapshot.currentRound.startedAtMs;
  const deadlineAtMs = snapshot.currentRound.deadlineAtMs;
  if (
    typeof startedAtMs !== "number" ||
    typeof deadlineAtMs !== "number" ||
    !Number.isSafeInteger(startedAtMs) ||
    !Number.isSafeInteger(deadlineAtMs) ||
    deadlineAtMs <= startedAtMs
  ) {
    return null;
  }
  const ratio = Math.max(
    0,
    Math.min(1, remainingMs / (deadlineAtMs - startedAtMs)),
  );
  return Math.max(100, Math.min(1_000, Math.floor(100 + 900 * ratio)));
}

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
    if (!isSongGuessSnapshot(value))
      throw new Error("invalid_song_guess_snapshot");
    return value;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export type SongGuessRoomCategory = { id: string; label: string; counts: { intro: number; highlight: number } };
export async function fetchSongGuessRooms(boardId: string): Promise<SongGuessSnapshot[]> {
  const value = await apiFetch<{ sessions: unknown[] }>(`/api/song-guess/boards/${encodeURIComponent(boardId)}/rooms`);
  if (!Array.isArray(value.sessions) || !value.sessions.every(isSongGuessSnapshot)) throw new Error("invalid_song_guess_rooms");
  return value.sessions;
}
export async function fetchSongGuessRoomCatalog(boardId: string): Promise<SongGuessRoomCategory[]> {
  return (await apiFetch<{ categories: SongGuessRoomCategory[] }>(`/api/song-guess/boards/${encodeURIComponent(boardId)}/rooms?catalog=1`)).categories;
}
export async function fetchSongGuessSnapshot(sessionId: string): Promise<SongGuessSnapshot> {
  const value = await apiFetch<unknown>(`/api/song-guess/sessions/${encodeURIComponent(sessionId)}`, { timeoutMs: 10_000 });
  if (!isSongGuessSnapshot(value)) throw new Error("invalid_song_guess_snapshot");
  return value;
}
export async function createSongGuessRoom(boardId: string, input: { requestId: string; categories: string[]; segment: "intro" | "highlight"; count: number }): Promise<SongGuessSnapshot> {
  const value = await apiFetch<{ requestId: string; snapshot: unknown }>(`/api/song-guess/boards/${encodeURIComponent(boardId)}/rooms`, { method: "POST", json: input, timeoutMs: 10_000 });
  if (value.requestId !== input.requestId || !isSongGuessSnapshot(value.snapshot)) throw new Error("invalid_song_guess_session_response");
  return value.snapshot;
}

export async function submitSongGuessCommand(
  sessionId: string,
  request: SongGuessCommandRequest,
): Promise<SongGuessCommandResponse> {
  const value = await apiFetch<unknown>(
    `/api/song-guess/sessions/${encodeURIComponent(sessionId)}/commands`,
    { method: "POST", json: request, timeoutMs: 10_000 },
  );
  if (
    !isSongGuessCommandResponse(value) ||
    value.requestId !== request.requestId
  ) {
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
      value.request.commandSchemaVersion !==
        SONG_GUESS_COMMAND_SCHEMA_VERSION ||
      !isSongGuessIntent(value.request.command)
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

export async function clearPendingSongGuessCommand(
  boardId: string,
): Promise<void> {
  await SecureStore.deleteItemAsync(pendingKey(boardId));
}

export function songGuessApiError(error: unknown): SongGuessApiError | null {
  if (
    !(error instanceof ApiError) ||
    !error.body ||
    typeof error.body !== "object"
  )
    return null;
  return error.body as SongGuessApiError;
}

export function phaseLabel(phase: SongGuessPhase): string {
  if (phase === "lobby") return "대기";
  if (phase === "guessing") return "진행";
  if (phase === "reveal") return "정답";
  if (phase === "finished") return "종료";
  return "준비";
}

export function formatClipLabel(tierMs: number): string {
  if (tierMs === 15_000) return "15초 듣기";
  return `${(tierMs / 1000).toFixed(1)}초`;
}

export function formatSeconds(seconds: number): string {
  return `${Math.max(0, seconds).toFixed(1)}초`;
}

export function monotonicNow(): number {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function messageForError(error: unknown): string {
  const body = songGuessApiError(error);
  switch (body?.error) {
    case "invalid_phase":
      return "지금은 제출할 수 없어요.";
    case "domain_rejected":
      return "정답을 처리하지 못했어요.";
    case "forbidden":
      return "참여 권한이 없어요.";
    case "unauthorized":
      return "다시 로그인해 주세요.";
    case "play_engine_unavailable":
      return "게임 서버 연결이 불안정해요.";
    default:
      return "연결을 확인해 주세요.";
  }
}
