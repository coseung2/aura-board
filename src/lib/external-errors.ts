/**
 * External API error catalog (Seed 8 §1.7).
 *
 * All `/api/external/*` and `/api/tokens/*` responses on failure use the
 * unified envelope `{ error: { code, message } }` with HTTP status mapped
 * per this catalog.
 */
import { NextResponse } from "next/server";

export type ExternalErrorCode =
  | "unauthorized" // 401 — missing Authorization or format mismatch
  | "invalid_token_format" // 401 — aurapat_ prefix/regex mismatch
  | "invalid_token" // 401 — prefix lookup miss or hash mismatch (timing-safe)
  | "token_revoked" // 410 — revokedAt/expiresAt reached
  | "revoked" // 410 — OAuth access token revoked
  | "expired" // 410 — OAuth access token expired
  | "orphan" // 409 — OAuth student or classroom teacher missing
  | "forbidden" // 403 — RBAC (not owner/editor on board)
  | "forbidden_board" // 403 — boardId outside scopeBoardIds allowlist
  | "forbidden_scope" // 403 — cards:write not in token.scopes
  | "not_found" // 404 — board does not exist
  | "tier_required" // 402 — Free tier but scope requires Pro
  | "token_limit_exceeded" // 400 — >10 active tokens
  | "invalid_data_url" // 422 — zod strict validation fail or bad data URL
  | "payload_too_large" // 413 — Content-Length > 4MB
  | "rate_limited" // 429 — 3-axis rate limit breach
  | "student_session_required" // 401 — Canva publish requires Aura student login
  | "blob_upload_failed" // 500 — streaming put error
  | "internal"; // 500 — unhandled

const STATUS: Record<ExternalErrorCode, number> = {
  unauthorized: 401,
  invalid_token_format: 401,
  invalid_token: 401,
  token_revoked: 410,
  revoked: 410,
  expired: 410,
  orphan: 409,
  forbidden: 403,
  forbidden_board: 403,
  forbidden_scope: 403,
  not_found: 404,
  tier_required: 402,
  token_limit_exceeded: 400,
  invalid_data_url: 422,
  payload_too_large: 413,
  rate_limited: 429,
  student_session_required: 401,
  blob_upload_failed: 500,
  internal: 500,
};

const DEFAULT_MESSAGE: Record<ExternalErrorCode, string> = {
  unauthorized: "Missing or invalid Authorization bearer token",
  invalid_token_format: "Token must match aurapat_{prefix}_{secret}",
  invalid_token: "Token not found or secret mismatch",
  token_revoked: "Token has been revoked or expired",
  revoked: "OAuth access token has been revoked",
  expired: "OAuth access token has expired — use refresh_token to get a new one",
  orphan: "OAuth token references a student or classroom that no longer exists",
  forbidden: "Token owner is not an editor of this board",
  forbidden_board: "Board is outside this token's scopeBoardIds allowlist",
  forbidden_scope: "Token does not include cards:write scope",
  not_found: "Board does not exist",
  tier_required:
    "Pro tier required for cards:write — upgrade at https://aura-board.com/pricing",
  token_limit_exceeded: "Maximum 10 active tokens per user reached",
  invalid_data_url: "Request body failed strict validation",
  payload_too_large: "Request body exceeds 4.0MB hard limit",
  rate_limited: "Rate limit exceeded — retry after the Retry-After window",
  student_session_required:
    "Aura 학생 로그인이 필요해요. /login 에서 로그인한 뒤 다시 시도하세요.",
  blob_upload_failed: "Image upload to storage failed",
  internal: "Internal server error",
};

export function externalErrorResponse(
  code: ExternalErrorCode,
  messageOverride?: string,
  extraHeaders: Record<string, string> = {}
): NextResponse {
  const status = STATUS[code];
  const message = messageOverride ?? DEFAULT_MESSAGE[code];
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: extraHeaders }
  );
}

export { STATUS as EXTERNAL_ERROR_STATUS };
