import {
  createPlayRequestId,
} from "@/lib/play-platform/contracts";
import {
  isSongGuessCommandResponse,
  isSongGuessSnapshot,
  SONG_GUESS_COMMAND_SCHEMA_VERSION,
  type SongGuessApiError,
  type SongGuessCommandRequest,
  type SongGuessCommandResponse,
  type SongGuessClipTierMs,
  type SongGuessIntent,
  type SongGuessSessionResponse,
  type SongGuessSetupInput,
  type SongGuessSnapshot,
  type SongGuessTeacherSetup,
  type UploadedSongGuessClip,
} from "./contracts";

export class SongGuessClientError extends Error {
  status: number;
  body: SongGuessApiError;

  constructor(status: number, body: SongGuessApiError) {
    super(body.error || `song_guess_api_${status}`);
    this.status = status;
    this.body = body;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const formDataBody =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body && !formDataBody ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({ error: "invalid_response" }))) as
    | T
    | SongGuessApiError;
  if (!response.ok) throw new SongGuessClientError(response.status, body as SongGuessApiError);
  return body as T;
}

export async function fetchCurrentSongGuessSession(
  boardId: string,
): Promise<SongGuessSnapshot | null> {
  try {
    const value = await requestJson<unknown>(
      `/api/song-guess/boards/${encodeURIComponent(boardId)}/session`,
    );
    if (!isSongGuessSnapshot(value)) throw new Error("invalid_song_guess_snapshot");
    return value;
  } catch (error) {
    if (error instanceof SongGuessClientError && error.status === 404) return null;
    throw error;
  }
}

export async function fetchSongGuessTeacherSetup(
  boardId: string,
): Promise<SongGuessTeacherSetup | null> {
  try {
    const value = await requestJson<unknown>(
      `/api/song-guess/boards/${encodeURIComponent(boardId)}/setup`,
    );
    if (!isSongGuessTeacherSetup(value)) throw new Error("invalid_song_guess_teacher_setup");
    return value;
  } catch (error) {
    if (error instanceof SongGuessClientError && error.status === 404) return null;
    throw error;
  }
}

export async function saveSongGuessTeacherSetup(
  boardId: string,
  input: SongGuessSetupInput,
): Promise<SongGuessTeacherSetup> {
  const value = await requestJson<unknown>(
    `/api/song-guess/boards/${encodeURIComponent(boardId)}/setup`,
    { method: "PUT", body: JSON.stringify(input) },
  );
  if (!isSongGuessTeacherSetup(value)) throw new Error("invalid_song_guess_teacher_setup");
  return value;
}

export async function deleteSongGuessTeacherSetup(boardId: string): Promise<boolean> {
  const value = await requestJson<{ deleted?: unknown }>(
    `/api/song-guess/boards/${encodeURIComponent(boardId)}/setup`,
    { method: "DELETE" },
  );
  return value.deleted === true;
}

export async function uploadSongGuessClip(
  boardId: string,
  blob: Blob,
  tierMs: SongGuessClipTierMs,
): Promise<UploadedSongGuessClip> {
  const form = new FormData();
  form.set("assetKind", "clip");
  form.set("tierMs", String(tierMs));
  form.set("durationMs", String(tierMs));
  form.set("file", blob, `${tierMs}.wav`);
  const value = await requestJson<unknown>(
    `/api/song-guess/boards/${encodeURIComponent(boardId)}/clips`,
    { method: "POST", body: form },
  );
  if (!isUploadedSongGuessClip(value) || value.tierMs !== tierMs) {
    throw new Error("invalid_uploaded_song_guess_clip");
  }
  return value;
}

export async function deleteSongGuessClip(
  boardId: string,
  assetId: string,
): Promise<boolean> {
  const value = await requestJson<{ deleted?: unknown }>(
    `/api/song-guess/boards/${encodeURIComponent(boardId)}/clips/${encodeURIComponent(assetId)}`,
    { method: "DELETE" },
  );
  return value.deleted === true;
}

export async function createSongGuessSession(
  boardId: string,
): Promise<SongGuessSessionResponse> {
  const requestId = createPlayRequestId("song_guess_create");
  const value = await requestJson<unknown>(
    `/api/song-guess/boards/${encodeURIComponent(boardId)}/session`,
    { method: "POST", body: JSON.stringify({ requestId }) },
  );
  if (!isRecord(value) || value.requestId !== requestId || !isSongGuessSnapshot(value.snapshot)) {
    throw new Error("invalid_song_guess_session_response");
  }
  return value as SongGuessSessionResponse;
}

export async function fetchSongGuessSnapshot(sessionId: string): Promise<SongGuessSnapshot> {
  const value = await requestJson<unknown>(
    `/api/song-guess/sessions/${encodeURIComponent(sessionId)}`,
  );
  if (!isSongGuessSnapshot(value)) throw new Error("invalid_song_guess_snapshot");
  return value;
}

export function makeSongGuessCommand(
  snapshot: SongGuessSnapshot,
  command: SongGuessIntent,
): SongGuessCommandRequest {
  return {
    requestId: createPlayRequestId(`song_guess_${command.type}`),
    expectedVersion: snapshot.version,
    commandSchemaVersion: SONG_GUESS_COMMAND_SCHEMA_VERSION,
    command,
  };
}

export async function submitSongGuessCommand(
  sessionId: string,
  request: SongGuessCommandRequest,
): Promise<SongGuessCommandResponse> {
  const value = await requestJson<unknown>(
    `/api/song-guess/sessions/${encodeURIComponent(sessionId)}/commands`,
    { method: "POST", body: JSON.stringify(request) },
  );
  if (!isSongGuessCommandResponse(value) || value.requestId !== request.requestId) {
    throw new Error("invalid_song_guess_command_response");
  }
  return value;
}

export function songGuessClipUrl(sessionId: string, assetId: string): string {
  return `/api/song-guess/sessions/${encodeURIComponent(sessionId)}/clips/${encodeURIComponent(assetId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isUploadedSongGuessClip(value: unknown): value is UploadedSongGuessClip {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    !!value.id &&
    [500, 1000, 1500].includes(Number(value.tierMs)) &&
    ["audio/wav", "audio/mp4", "audio/webm", "audio/ogg"].includes(String(value.mimeType)) &&
    Number.isSafeInteger(value.sizeBytes) &&
    Number(value.sizeBytes) > 0 &&
    Number.isSafeInteger(value.durationMs)
  );
}

function isSongGuessTeacherSetup(value: unknown): value is SongGuessTeacherSetup {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.boardId !== "string" ||
    !Array.isArray(value.rounds)
  ) {
    return false;
  }
  return value.rounds.every((round) => {
    if (
      !isRecord(round) ||
      typeof round.id !== "string" ||
      !Number.isSafeInteger(round.order) ||
      typeof round.representativeAnswer !== "string" ||
      !Array.isArray(round.aliases) ||
      round.aliases.some((alias) => typeof alias !== "string") ||
      !(round.accessibilityClue === null || typeof round.accessibilityClue === "string") ||
      !Array.isArray(round.clips) ||
      round.clips.length !== 3
    ) {
      return false;
    }
    return round.clips.every(isUploadedSongGuessClip);
  });
}
