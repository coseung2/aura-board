import type {
  OmokIntent,
  OmokMatchmakingStatus,
  OmokPlayerProfile,
  OmokRosterStudent,
  OmokSnapshot,
  PlayApiError,
  PlayCommandRequest,
  PlayCommandResponse,
  PlaySessionResponse,
} from "./contracts";
import {
  PLAY_COMMAND_SCHEMA_VERSION,
  createPlayRequestId,
  isOmokSnapshot,
  isPlayCommandResponse,
} from "./contracts";

export class PlayClientError extends Error {
  status: number;
  body: PlayApiError;

  constructor(status: number, body: PlayApiError) {
    super(body.error || `play_api_${status}`);
    this.status = status;
    this.body = body;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({ error: "invalid_response" }))) as
    | T
    | PlayApiError;
  if (!response.ok) throw new PlayClientError(response.status, body as PlayApiError);
  return body as T;
}

export async function fetchCurrentOmokSession(boardId: string): Promise<OmokSnapshot | null> {
  try {
    const value = await requestJson<unknown>(
      `/api/play/boards/${encodeURIComponent(boardId)}/session`,
    );
    if (!isOmokSnapshot(value)) throw new Error("invalid_omok_snapshot");
    return value;
  } catch (error) {
    if (error instanceof PlayClientError && error.status === 404) return null;
    throw error;
  }
}

export async function fetchOmokSnapshot(sessionId: string): Promise<OmokSnapshot> {
  const value = await requestJson<unknown>(
    `/api/play/sessions/${encodeURIComponent(sessionId)}`,
  );
  if (!isOmokSnapshot(value)) throw new Error("invalid_omok_snapshot");
  return value;
}

export async function fetchOmokRoster(boardId: string): Promise<OmokRosterStudent[]> {
  const value = await requestJson<{ students: OmokRosterStudent[] }>(
    `/api/play/boards/${encodeURIComponent(boardId)}/roster`,
  );
  return value.students;
}

export async function createOmokSession(
  boardId: string,
  studentIds: [string, string],
): Promise<PlaySessionResponse> {
  return requestJson<PlaySessionResponse>(
    `/api/play/boards/${encodeURIComponent(boardId)}/session`,
    {
      method: "POST",
      body: JSON.stringify({
        requestId: createPlayRequestId("create"),
        studentIds,
      }),
    },
  );
}

export function makeOmokCommand(
  snapshot: OmokSnapshot,
  command: OmokIntent,
): PlayCommandRequest {
  return {
    requestId: createPlayRequestId(command.type),
    expectedVersion: snapshot.version,
    commandSchemaVersion: PLAY_COMMAND_SCHEMA_VERSION,
    command,
  };
}

export async function submitOmokCommand(
  sessionId: string,
  request: PlayCommandRequest,
): Promise<PlayCommandResponse> {
  const value = await requestJson<unknown>(
    `/api/play/sessions/${encodeURIComponent(sessionId)}/commands`,
    { method: "POST", body: JSON.stringify(request) },
  );
  if (!isPlayCommandResponse(value) || value.requestId !== request.requestId) {
    throw new Error("invalid_play_command_response");
  }
  return value;
}

export async function createOmokRematch(sessionId: string): Promise<PlaySessionResponse> {
  return requestJson<PlaySessionResponse>(
    `/api/play/sessions/${encodeURIComponent(sessionId)}/rematch`,
    {
      method: "POST",
      body: JSON.stringify({ requestId: createPlayRequestId("rematch") }),
    },
  );
}

export async function fetchOmokMatchmaking(boardId: string): Promise<OmokMatchmakingStatus> {
  return requestJson<OmokMatchmakingStatus>(
    `/api/play/boards/${encodeURIComponent(boardId)}/matchmaking`,
  );
}

export async function requestOmokMatch(boardId: string): Promise<OmokMatchmakingStatus> {
  return requestJson<OmokMatchmakingStatus>(
    `/api/play/boards/${encodeURIComponent(boardId)}/matchmaking`,
    { method: "POST" },
  );
}

export async function cancelOmokMatch(boardId: string): Promise<OmokMatchmakingStatus> {
  return requestJson<OmokMatchmakingStatus>(
    `/api/play/boards/${encodeURIComponent(boardId)}/matchmaking`,
    { method: "DELETE" },
  );
}

export async function fetchOmokPlayerProfiles(sessionId: string): Promise<{
  startedAtMs: number | null;
  players: OmokPlayerProfile[];
}> {
  return requestJson(
    `/api/play/sessions/${encodeURIComponent(sessionId)}/players`,
  );
}
