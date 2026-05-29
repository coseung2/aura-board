/**
 * with-share — Extract a ShareIdentity from a NextRequest header or raw token,
 * and provide helpers for API routes and server components.
 *
 * Intended to bridge the gap between the old dedicated /api/share/* endpoints
 * and the unified pattern where main API routes handle share tokens via the
 * x-share-token header and card-permissions.ts ShareIdentity.
 */
import "server-only";
import type { NextRequest } from "next/server";
import { authorizeShareAccess } from "./share-auth";
import type { ShareIdentity } from "@/lib/card-permissions";

/** Extract x-share-token from a NextRequest headers map. */
export function getShareTokenFromRequest(req: NextRequest): string | null {
  return req.headers.get("x-share-token");
}

/**
 * Resolve a share token to a ShareIdentity.
 * Returns null when the token is missing, invalid, or the board is private.
 *
 * Used by API routes that want to check share access without a separate
 * early-return path:
 *
 *   const shareId = await resolveShareIdentity(shareToken, "view");
 *   if (!shareId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
 */
export async function resolveShareIdentity(
  shareToken: string | null,
  authorName?: string,
): Promise<ShareIdentity | null> {
  if (!shareToken) return null;

  const auth = await authorizeShareAccess(shareToken, "view");
  if (!auth.ok) return null;

  return {
    shareToken,
    boardId: auth.boardId,
    permission: auth.permission,
    authorName: authorName ?? "Guest",
  };
}

/**
 * Auth guard that returns a ShareIdentity when the share token is valid AND
 * the board's shareMode grants at least the required permission level.
 */
export async function requireShareAuth(
  shareToken: string | null,
  required: "view" | "comment" | "edit",
  authorName?: string,
): Promise<{ identity: ShareIdentity } | { error: string; status: number }> {
  if (!shareToken) return { error: "missing_share_token", status: 401 };

  const auth = await authorizeShareAccess(shareToken, required);
  if (!auth.ok) {
    const reason = auth.reason;
    const status = reason === "not_found" ? 404 : 403;
    return { error: reason, status };
  }

  return {
    identity: {
      shareToken,
      boardId: auth.boardId,
      permission: auth.permission,
      authorName: authorName ?? "Guest",
    },
  };
}
