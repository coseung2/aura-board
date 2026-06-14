import "server-only";
import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { db } from "./db";

// Parent session cookie + DB row pair.
//
//   Cookie "parent_session"  =  base64url(32 random bytes)        (plaintext)
//   DB     ParentSession.tokenHash = sha256(cookie_value)         (indexed)
//
// On every request, middleware looks up the session by tokenHash (not by
// sessionToken equality) to avoid timing leaks and to allow hash-based
// revocation sweeps. The DB `sessionToken` column is also stored (unique)
// for admin debugging; we never compare by it directly at request time.
//
// 7-day TTL. Cookie is HttpOnly, SameSite=Lax, Secure in production.
// sessionRevokedAt → treated as an immediate 401 in parent-scope.ts.

const COOKIE_NAME = "parent_session";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_AGE_S = Math.floor(MAX_AGE_MS / 1000);
const LAST_SEEN_TOUCH_MS = 5 * 60 * 1000;

function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a ParentSession row + set the HttpOnly cookie.
 * Caller is expected to have already verified the magic link.
 */
export async function createParentSession(params: {
  parentId: string;
  userAgent?: string | null;
  ipHash?: string | null;
}) {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAX_AGE_MS);

  await db.parentSession.create({
    data: {
      parentId: params.parentId,
      sessionToken: token,
      tokenHash,
      userAgent: params.userAgent ?? null,
      ipHash: params.ipHash ?? null,
      expiresAt,
      lastSeenAt: now,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
  return { token, expiresAt };
}

/**
 * Retrieve the current Parent from the request. Token resolution order:
 *   1. `Authorization: Bearer <token>` header — mobile (Expo SecureStore)
 *   2. `parent_session` cookie — web
 *
 * Both paths use the same 32-byte base64url plaintext; the DB lookup is
 * keyed on `tokenHash` (sha256) in both cases. Returns null on:
 *  - no header / cookie
 *  - no matching session
 *  - session revoked (sessionRevokedAt != null)
 *  - session expired (expiresAt <= now)
 *  - parent soft-deleted (parentDeletedAt != null)
 *
 * On a successful lookup, bumps lastSeenAt (best-effort; errors swallowed).
 */
export async function getCurrentParent() {
  const headerList = await headers();
  const authHeader =
    headerList.get("authorization") ?? headerList.get("Authorization");
  let token: string | null = null;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    const cookieStore = await cookies();
    token = cookieStore.get(COOKIE_NAME)?.value ?? null;
  }
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await db.parentSession.findUnique({
    where: { tokenHash },
    include: { parent: true },
  });
  if (!session) return null;

  const now = new Date();
  if (session.sessionRevokedAt) return null;
  if (session.expiresAt <= now) return null;
  if (session.parent.parentDeletedAt) return null;

  // Best-effort lastSeenAt bump. Keep it sequential and throttled so a
  // serverless Prisma pool with connection_limit=1 does not run two queries
  // concurrently in the same request.
  if (!session.lastSeenAt || now.getTime() - session.lastSeenAt.getTime() > LAST_SEEN_TOUCH_MS) {
    await db.parentSession
      .update({ where: { id: session.id }, data: { lastSeenAt: now } })
      .catch(() => undefined);
  }

  return { parent: session.parent, session };
}

/** Clear the cookie + revoke the current session row. */
export async function clearParentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    await db.parentSession
      .updateMany({
        where: { tokenHash, sessionRevokedAt: null },
        data: { sessionRevokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  cookieStore.delete(COOKIE_NAME);
}

export { COOKIE_NAME as PARENT_SESSION_COOKIE_NAME };
