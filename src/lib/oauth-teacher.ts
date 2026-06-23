/**
 * Teacher-side OAuth 2.0 helpers (RFC 6749 + RFC 7636 PKCE).
 *
 * Mirror structure of `oauth-server.ts` (student/Canva OAuth) but operates on
 * `userId` column of the same OAuthAuthCode/AccessToken/RefreshToken tables.
 * Token plaintext format uses `auratea_` prefix (vs `aurastu_` for students)
 * so callers can distinguish at a glance + we never confuse subject types.
 *
 * Aura companion (teacher web app) uses this to read /api/external/feedbacks
 * and /api/external/grades scoped to the authenticated teacher's classrooms.
 */
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { db } from "./db";

export const TEACHER_ACCESS_PREFIX = "auratea_";
export const TEACHER_REFRESH_PREFIX = "aurater_";
export const TOKEN_PREFIX_LEN = 8;
export const TOKEN_SECRET_LEN = 40;

// Lifetimes — teacher OAuth is shorter than student pairing because polling
// from Aura is low-frequency (read-only data, no realtime needed) and AURA
// agent agreed access 1h / refresh 30d / rotate-on-use.
export const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 min
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const ACCESS_TOKEN_REGEX = /^auratea_[0-9A-Za-z]{8}_[0-9A-Za-z_-]{40}$/;
const REFRESH_TOKEN_REGEX = /^aurater_[0-9A-Za-z]{8}_[0-9A-Za-z_-]{40}$/;

const DUMMY_HASH = createHash("sha256").update("oauth:teacher:dummy:v1").digest("hex");

function pepper(): string {
  const p = process.env.AURA_PAT_PEPPER;
  if (!p || p.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AURA_PAT_PEPPER required (≥32 chars) for teacher OAuth token hashing"
      );
    }
    return "aura-dev-pepper-fallback-ge-32-chars-for-local-use-only";
  }
  return p;
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(`${secret}:${pepper()}`).digest("hex");
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function base62(len: number): string {
  const buf = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += BASE62[buf[i] % 62];
  return out;
}

function makePair(): { prefix: string; secret: string } {
  const prefix = base62(TOKEN_PREFIX_LEN);
  const raw = randomBytes(30).toString("base64url").slice(0, TOKEN_SECRET_LEN);
  const secret = raw.padEnd(TOKEN_SECRET_LEN, "A");
  return { prefix, secret };
}

// ─── Authorization code (teacher subject) ────────────────────────────────

export async function issueTeacherAuthCode(params: {
  userId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod?: string;
  state?: string | null;
}): Promise<string> {
  const code = randomBytes(30).toString("base64url");
  await db.oAuthAuthCode.create({
    data: {
      code,
      userId: params.userId,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod ?? "S256",
      state: params.state ?? null,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    },
  });
  return code;
}

export async function consumeTeacherAuthCode(params: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<
  | { ok: true; userId: string; scope: string }
  | { ok: false; error: "invalid_grant" }
> {
  const row = await db.oAuthAuthCode.findUnique({ where: { code: params.code } });
  if (!row) return { ok: false, error: "invalid_grant" };
  if (!row.userId) return { ok: false, error: "invalid_grant" }; // student code, wrong endpoint
  if (row.consumedAt) return { ok: false, error: "invalid_grant" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, error: "invalid_grant" };
  if (row.clientId !== params.clientId) return { ok: false, error: "invalid_grant" };
  if (row.redirectUri !== params.redirectUri) return { ok: false, error: "invalid_grant" };

  const challenge = createHash("sha256")
    .update(params.codeVerifier)
    .digest("base64url");
  if (challenge !== row.codeChallenge) return { ok: false, error: "invalid_grant" };

  await db.oAuthAuthCode.update({
    where: { code: params.code },
    data: { consumedAt: new Date() },
  });

  return { ok: true, userId: row.userId, scope: row.scope };
}

// ─── Token issuance ──────────────────────────────────────────────────────

export interface TeacherTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
  tokenType: "Bearer";
}

export async function issueTeacherTokenPair(params: {
  userId: string;
  clientId: string;
  scope: string;
  parentRefreshHash?: string | null;
}): Promise<TeacherTokenPair> {
  const access = makePair();
  const refresh = makePair();
  const now = Date.now();

  await db.$transaction([
    db.oAuthAccessToken.create({
      data: {
        tokenHash: hashSecret(access.secret),
        tokenPrefix: access.prefix,
        userId: params.userId,
        clientId: params.clientId,
        scope: params.scope,
        expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
      },
    }),
    db.oAuthRefreshToken.create({
      data: {
        tokenHash: hashSecret(refresh.secret),
        tokenPrefix: refresh.prefix,
        userId: params.userId,
        clientId: params.clientId,
        scope: params.scope,
        expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
        parentTokenHash: params.parentRefreshHash ?? null,
      },
    }),
  ]);

  return {
    accessToken: `${TEACHER_ACCESS_PREFIX}${access.prefix}_${access.secret}`,
    refreshToken: `${TEACHER_REFRESH_PREFIX}${refresh.prefix}_${refresh.secret}`,
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope: params.scope,
    tokenType: "Bearer",
  };
}

export async function issueTeacherAccessToken(params: {
  userId: string;
  clientId: string;
  scope: string;
}): Promise<{ accessToken: string; expiresIn: number; scope: string; tokenType: "Bearer" }> {
  const access = makePair();

  await db.oAuthAccessToken.create({
    data: {
      tokenHash: hashSecret(access.secret),
      tokenPrefix: access.prefix,
      userId: params.userId,
      clientId: params.clientId,
      scope: params.scope,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    },
  });

  return {
    accessToken: `${TEACHER_ACCESS_PREFIX}${access.prefix}_${access.secret}`,
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope: params.scope,
    tokenType: "Bearer",
  };
}

// ─── Refresh grant (rotate-on-use) ───────────────────────────────────────

export async function rotateTeacherRefresh(params: {
  refreshPlaintext: string;
  clientId: string;
}): Promise<
  | { ok: true; pair: TeacherTokenPair }
  | { ok: false; error: "invalid_grant" }
> {
  if (!REFRESH_TOKEN_REGEX.test(params.refreshPlaintext)) {
    return { ok: false, error: "invalid_grant" };
  }
  const prefix = params.refreshPlaintext.slice(
    TEACHER_REFRESH_PREFIX.length,
    TEACHER_REFRESH_PREFIX.length + TOKEN_PREFIX_LEN
  );
  const secret = params.refreshPlaintext.slice(
    TEACHER_REFRESH_PREFIX.length + TOKEN_PREFIX_LEN + 1
  );

  const row = await db.oAuthRefreshToken.findUnique({ where: { tokenPrefix: prefix } });
  if (!row || !row.userId) {
    const dummy = Buffer.from(DUMMY_HASH, "hex");
    timingSafeEqual(dummy, dummy);
    return { ok: false, error: "invalid_grant" };
  }

  const a = Buffer.from(hashSecret(secret), "hex");
  const b = Buffer.from(row.tokenHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "invalid_grant" };
  }

  if (row.revokedAt) {
    // Reuse-after-revoke: revoke entire chain (RFC 6749 §10.5).
    await db.oAuthAccessToken.updateMany({
      where: {
        userId: row.userId,
        clientId: row.clientId,
        scope: row.scope,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return { ok: false, error: "invalid_grant" };
  }
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, error: "invalid_grant" };
  if (row.clientId !== params.clientId) return { ok: false, error: "invalid_grant" };

  // Revoke old refresh + access for clean rotation.
  await db.oAuthRefreshToken.update({
    where: { tokenHash: row.tokenHash },
    data: { revokedAt: new Date() },
  });
  await db.oAuthAccessToken.updateMany({
    where: {
      userId: row.userId,
      clientId: row.clientId,
      scope: row.scope,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  const pair = await issueTeacherTokenPair({
    userId: row.userId,
    clientId: row.clientId,
    scope: row.scope,
    parentRefreshHash: row.tokenHash,
  });
  return { ok: true, pair };
}

// ─── Access token verification (for /api/external/*) ─────────────────────

export async function verifyTeacherAccessToken(plaintext: string): Promise<
  | { ok: true; userId: string; clientId: string; scope: string }
  | { ok: false; code: "invalid_token_format" | "invalid_token" | "revoked" | "expired" | "wrong_subject" }
> {
  if (!ACCESS_TOKEN_REGEX.test(plaintext)) {
    return { ok: false, code: "invalid_token_format" };
  }
  const prefix = plaintext.slice(
    TEACHER_ACCESS_PREFIX.length,
    TEACHER_ACCESS_PREFIX.length + TOKEN_PREFIX_LEN
  );
  const secret = plaintext.slice(TEACHER_ACCESS_PREFIX.length + TOKEN_PREFIX_LEN + 1);

  const row = await db.oAuthAccessToken.findUnique({ where: { tokenPrefix: prefix } });
  if (!row) {
    const dummy = Buffer.from(DUMMY_HASH, "hex");
    timingSafeEqual(dummy, dummy);
    return { ok: false, code: "invalid_token" };
  }
  const a = Buffer.from(hashSecret(secret), "hex");
  const b = Buffer.from(row.tokenHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, code: "invalid_token" };
  }
  if (!row.userId) return { ok: false, code: "wrong_subject" };
  if (row.revokedAt) return { ok: false, code: "revoked" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, code: "expired" };

  void db.oAuthAccessToken
    .update({ where: { tokenHash: row.tokenHash }, data: { lastUsedAt: new Date() } })
    .catch(() => void 0);

  return { ok: true, userId: row.userId, clientId: row.clientId, scope: row.scope };
}

// ─── Revocation (RFC 7009) ───────────────────────────────────────────────

export async function revokeTeacherToken(plaintext: string): Promise<void> {
  if (ACCESS_TOKEN_REGEX.test(plaintext)) {
    const prefix = plaintext.slice(
      TEACHER_ACCESS_PREFIX.length,
      TEACHER_ACCESS_PREFIX.length + TOKEN_PREFIX_LEN
    );
    await db.oAuthAccessToken.updateMany({
      where: { tokenPrefix: prefix, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return;
  }
  if (REFRESH_TOKEN_REGEX.test(plaintext)) {
    const prefix = plaintext.slice(
      TEACHER_REFRESH_PREFIX.length,
      TEACHER_REFRESH_PREFIX.length + TOKEN_PREFIX_LEN
    );
    await db.oAuthRefreshToken.updateMany({
      where: { tokenPrefix: prefix, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return;
  }
}

/** Format detector — caller routes to teacher-side helpers vs student-side. */
export function isTeacherTokenFormat(plaintext: string): boolean {
  return ACCESS_TOKEN_REGEX.test(plaintext) || REFRESH_TOKEN_REGEX.test(plaintext);
}
