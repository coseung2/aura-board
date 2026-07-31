/**
 * Cloudflare Stream lifecycle helpers (ES-7).
 *
 * Cloudflare Stream is the *video-only* axis of the 4-provider media setup.
 * This module deliberately stays a thin wrapper over the public REST API:
 * no SDK, no queue, no storage abstraction, no DB schema of its own.
 *
 * Contracts used (verified 2026-07-31):
 *   POST   /accounts/{account}/stream/direct_upload  — `maxDurationSeconds`
 *          is REQUIRED and must be 1..36000. `creator`/`meta`/`expiry` optional.
 *   GET    /accounts/{account}/stream/{uid}          — result.uid,
 *          result.readyToStream, result.status.state, result.creator, result.meta.
 *   DELETE /accounts/{account}/stream/{uid}          — needs a Stream *Write* token.
 *
 * Configuration is via server-only env: CF_ACCOUNT_ID, CF_STREAM_API_TOKEN.
 * When either is missing every helper reports "not configured" instead of
 * throwing, so boards keep working with the YouTube fallback.
 *
 * Logging/error policy: never put the API token or a raw Cloudflare response
 * body into an error message or log line. Only HTTP status and Cloudflare's
 * numeric error codes are propagated.
 */

const CF_API_BASE = "https://api.cloudflare.com/client/v4";
const REQUEST_TIMEOUT_MS = 10_000;

/** Cloudflare's documented bounds for direct_upload.maxDurationSeconds. */
export const CF_MAX_DURATION_MIN = 1;
export const CF_MAX_DURATION_MAX = 36_000;
/** Used when a board has no explicit per-video duration cap. */
export const CF_DEFAULT_MAX_DURATION_SECONDS = 600;

/** Cloudflare video uids are <=32 chars; we only ever accept hex-ish ASCII. */
const UID_PATTERN = /^[A-Za-z0-9]{1,32}$/;

export type DirectUploadResult = {
  uploadURL: string;
  uid: string;
};

/** Cloudflare `status.state` values. */
export type CfStreamState =
  | "pendingupload"
  | "downloading"
  | "queued"
  | "inprogress"
  | "ready"
  | "error"
  | "live-inprogress";

export type CfStreamVideo = {
  uid: string;
  readyToStream: boolean;
  state: CfStreamState | null;
  creator: string | null;
  meta: Record<string, unknown>;
};

export type CfStreamErrorCode =
  | "not_configured"
  | "invalid_uid"
  | "http_error"
  | "api_error"
  | "bad_response"
  | "network_error";

/**
 * Redacted-by-construction error. `message` is a fixed string plus HTTP status
 * and Cloudflare error codes; response bodies and tokens never reach it.
 */
export class CfStreamError extends Error {
  readonly code: CfStreamErrorCode;
  readonly status?: number;
  readonly apiErrorCodes?: number[];

  constructor(
    code: CfStreamErrorCode,
    opts: { status?: number; apiErrorCodes?: number[] } = {}
  ) {
    const parts = [`cfstream ${code}`];
    if (opts.status != null) parts.push(`status=${opts.status}`);
    if (opts.apiErrorCodes?.length) parts.push(`cf_codes=${opts.apiErrorCodes.join(",")}`);
    super(parts.join(" "));
    this.name = "CfStreamError";
    this.code = code;
    this.status = opts.status;
    this.apiErrorCodes = opts.apiErrorCodes;
  }
}

export function cfStreamEnabled(): boolean {
  return Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_STREAM_API_TOKEN);
}

/** True for strings that are safe to interpolate into a Stream API path. */
export function isValidStreamUid(uid: unknown): uid is string {
  return typeof uid === "string" && UID_PATTERN.test(uid);
}

/** Stable board-scoped ownership tag stored on the Stream video. */
export function streamCreatorForBoard(boardId: string): string {
  // Cloudflare `creator` is a free-form <=64 char id. Prefixing keeps it
  // obvious in the dashboard and lets submit verify ownership without a
  // new DB column.
  return `board:${boardId}`.slice(0, 64);
}

/** Clamp a board-configured duration into Cloudflare's accepted range. */
export function normalizeMaxDurationSeconds(value?: number | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return CF_DEFAULT_MAX_DURATION_SECONDS;
  }
  const rounded = Math.floor(value);
  if (rounded < CF_MAX_DURATION_MIN) return CF_MAX_DURATION_MIN;
  if (rounded > CF_MAX_DURATION_MAX) return CF_MAX_DURATION_MAX;
  return rounded;
}

type CfEnvelope<T> = {
  success?: unknown;
  result?: T;
  errors?: unknown;
};

function readErrorCodes(errors: unknown): number[] | undefined {
  if (!Array.isArray(errors)) return undefined;
  const codes = errors
    .map((e) => (e && typeof e === "object" ? (e as { code?: unknown }).code : undefined))
    .filter((c): c is number => typeof c === "number");
  return codes.length ? codes : undefined;
}

/**
 * Single authenticated fetch helper. Returns the parsed Cloudflare envelope for
 * 2xx responses, or `null` for 404 (so callers can treat "gone" as a normal
 * outcome). Everything else throws a redacted CfStreamError.
 */
async function cfFetch<T>(
  path: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: unknown }
): Promise<CfEnvelope<T> | null> {
  const account = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_STREAM_API_TOKEN;
  if (!account || !token) throw new CfStreamError("not_configured");

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (init.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${CF_API_BASE}/accounts/${account}/stream${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Message intentionally dropped: it can echo the request URL.
    throw new CfStreamError("network_error");
  }

  if (res.status === 404) return null;

  let json: CfEnvelope<T> | null = null;
  try {
    json = (await res.json()) as CfEnvelope<T>;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new CfStreamError("http_error", {
      status: res.status,
      apiErrorCodes: readErrorCodes(json?.errors),
    });
  }
  if (!json || typeof json !== "object") {
    throw new CfStreamError("bad_response", { status: res.status });
  }
  if (json.success !== true) {
    throw new CfStreamError("api_error", {
      status: res.status,
      apiErrorCodes: readErrorCodes(json.errors),
    });
  }
  return json;
}

/**
 * Issue a direct-creator-upload URL.
 *
 * Returns `null` only when Cloudflare is not configured — the route maps that
 * to 501 and the UI falls back to YouTube. Real API failures throw so they are
 * not silently indistinguishable from "feature off".
 */
export async function createDirectUploadUrl(opts: {
  maxDurationSeconds?: number | null;
  maxSizeMb?: number | null;
  creator?: string | null;
  meta?: Record<string, string>;
}): Promise<DirectUploadResult | null> {
  if (!cfStreamEnabled()) return null;

  const body: Record<string, unknown> = {
    // REQUIRED by Cloudflare. Previously omitted when the board had no cap,
    // which made the API reject the request.
    maxDurationSeconds: normalizeMaxDurationSeconds(opts.maxDurationSeconds),
  };
  // maxSizeMb has no direct CF field; it's enforced client-side pre-upload.
  if (opts.creator) body.creator = opts.creator;
  if (opts.meta && Object.keys(opts.meta).length > 0) body.meta = opts.meta;

  const json = await cfFetch<{ uploadURL?: unknown; uid?: unknown }>("/direct_upload", {
    method: "POST",
    body,
  });
  // direct_upload never legitimately 404s; treat it as a schema violation.
  const result = json?.result;
  const uploadURL = result?.uploadURL;
  const uid = result?.uid;
  if (typeof uploadURL !== "string" || !uploadURL || !isValidStreamUid(uid)) {
    throw new CfStreamError("bad_response");
  }
  return { uploadURL, uid };
}

/**
 * Fetch video details. `null` means "no such video" (404) or "not configured".
 * Throws CfStreamError for API/transport failures.
 */
export async function getVideoDetails(uid: string): Promise<CfStreamVideo | null> {
  if (!cfStreamEnabled()) return null;
  if (!isValidStreamUid(uid)) throw new CfStreamError("invalid_uid");

  const json = await cfFetch<{
    uid?: unknown;
    readyToStream?: unknown;
    status?: { state?: unknown } | null;
    creator?: unknown;
    meta?: unknown;
  }>(`/${uid}`, { method: "GET" });
  if (json === null) return null;

  const result = json.result;
  if (
    !result ||
    typeof result !== "object" ||
    !isValidStreamUid(result.uid) ||
    result.uid !== uid
  ) {
    throw new CfStreamError("bad_response");
  }
  const state = result.status?.state;
  return {
    uid: result.uid,
    readyToStream: result.readyToStream === true,
    state: typeof state === "string" ? (state as CfStreamState) : null,
    creator: typeof result.creator === "string" ? result.creator : null,
    meta:
      result.meta && typeof result.meta === "object"
        ? (result.meta as Record<string, unknown>)
        : {},
  };
}

export type SubmittableCheck =
  | { ok: true; pending: boolean }
  | { ok: false; reason: "upload_incomplete" | "encoding_failed" | "unknown_state" };

/**
 * Decide whether a video may be attached to a Submission.
 *
 * Accepted: `ready`, and also `downloading`/`queued`/`inprogress` — Cloudflare
 * encoding routinely finishes seconds *after* the browser upload completes, and
 * blocking the applicant on it would fail honest submissions right at the
 * deadline. Those are returned with `pending: true` so callers can label them.
 * Rejected: `pendingupload` (nothing was ever uploaded — the failure mode we
 * actually care about), `error` (encoding failed), `live-inprogress` (a live
 * input, not a submitted file) and any unrecognised state.
 */
export function checkSubmittable(video: CfStreamVideo): SubmittableCheck {
  switch (video.state) {
    case "pendingupload":
      return { ok: false, reason: "upload_incomplete" };
    case "error":
      return { ok: false, reason: "encoding_failed" };
    case "ready":
      return { ok: true, pending: false };
    case "downloading":
    case "queued":
    case "inprogress":
      return { ok: true, pending: true };
    default:
      return video.readyToStream
        ? { ok: true, pending: false }
        : { ok: false, reason: "unknown_state" };
  }
}

export type DeleteVideoResult =
  | { ok: true; alreadyGone: boolean }
  | { ok: false; reason: "not_configured" | "invalid_uid" | "api_failed" };

/**
 * Best-effort delete. Never throws: callers delete the DB row first and must
 * not fail the user-facing request because Cloudflare had a bad minute.
 * A 404 counts as success (idempotent re-delete).
 */
export async function deleteVideo(uid: string): Promise<DeleteVideoResult> {
  if (!cfStreamEnabled()) return { ok: false, reason: "not_configured" };
  if (!isValidStreamUid(uid)) return { ok: false, reason: "invalid_uid" };
  try {
    const json = await cfFetch(`/${uid}`, { method: "DELETE" });
    return { ok: true, alreadyGone: json === null };
  } catch {
    return { ok: false, reason: "api_failed" };
  }
}
