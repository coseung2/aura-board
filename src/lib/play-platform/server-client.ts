import "server-only";

import type { PlayActor } from "./actor";
import { signPlayActorAssertion } from "./actor";
import { isPlayCommandResponse } from "./contracts";
import { announcePlaySessionChange } from "../realtime-broadcast";

const REQUEST_TIMEOUT_MS = 5_000;

export class PlayEngineUnavailableError extends Error {
  constructor(message = "play_engine_unavailable") {
    super(message);
    this.name = "PlayEngineUnavailableError";
  }
}

function playEngineBaseUrl(): string {
  const value = process.env.PLAY_ENGINE_URL?.trim();
  if (!value) throw new PlayEngineUnavailableError("PLAY_ENGINE_URL is required");
  return value.replace(/\/$/, "");
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (error) {
    throw new PlayEngineUnavailableError(
      error instanceof Error ? error.message : "play_engine_request_failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function playEngineFetch(
  path: string,
  options: {
    actor: PlayActor;
    method?: "GET" | "POST";
    body?: unknown;
  },
): Promise<Response> {
  return fetchWithTimeout(`${playEngineBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      "x-aura-play-actor": signPlayActorAssertion(options.actor),
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export async function playEngineInternalFetch(
  path: string,
  options: { body?: unknown } = {},
): Promise<Response> {
  const secret = process.env.PLAY_ENGINE_INTERNAL_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new PlayEngineUnavailableError(
      "PLAY_ENGINE_INTERNAL_SECRET must be at least 32 bytes",
    );
  }
  return fetchWithTimeout(`${playEngineBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-aura-play-internal-secret": secret,
    },
    body: JSON.stringify(options.body ?? {}),
  });
}

export async function proxyPlayEngineResponse(response: Response, options: { broadcastOnSuccess?: boolean } = {}): Promise<Response> {
  if (response.ok && options.broadcastOnSuccess) {
    const payload: unknown = await response.clone().json().catch(() => null);
    if (isPlayCommandResponse(payload)) {
      const snapshot = payload.snapshot;
      await announcePlaySessionChange(snapshot.boardId, snapshot.sessionId, snapshot.version, snapshot.roomStatus !== "active");
    }
  }
  const body = await response.arrayBuffer();
  const headers = new Headers();
  headers.set("content-type", response.headers.get("content-type") ?? "application/json");
  headers.set("cache-control", "private, no-store, max-age=0");
  const replay = response.headers.get("x-idempotent-replay");
  if (replay) headers.set("x-idempotent-replay", replay);
  return new Response(body, { status: response.status, headers });
}
