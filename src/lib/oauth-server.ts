/**
 * OAuth 2.0 Authorization Server runtime helpers.
 *
 * Aura issues student-scoped access + refresh tokens to the Canva Content
 * Publisher app via RFC 6749 Authorization Code + RFC 7636 PKCE (S256).
 * See tasks/2026-04-14-oauth2-provider/phase1/research_pack.md for the
 * Canva-specific contract this library satisfies.
 *
 * Token format (mirrors PAT shape for operational parity):
 *   Access  : `aurastu_{8 base62 prefix}_{40 base64url secret}`
 *   Refresh : `aurastr_{8 base62 prefix}_{40 base64url secret}`
 *   AuthCode: 40-char base64url (opaque — handed off to Canva, short-lived)
 *
 * Hashing strategy: plaintext secrets are returned exactly once at issuance.
 * On DB we persist SHA-256(secret ‖ AURA_PAT_PEPPER) so a DB leak alone does
 * not let the attacker call our APIs. The 8-char prefix is indexed for O(1)
 * lookup and timing-safe compared against the plaintext on verify.
 */
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { db } from "./db";

export const ACCESS_TOKEN_FULL_PREFIX = "aurastu_";
export const REFRESH_TOKEN_FULL_PREFIX = "aurastr_";
export const TOKEN_PREFIX_LEN = 8;
export const TOKEN_SECRET_LEN = 40;

// Lifetimes (ms).
export const AUTH_CODE_TTL_MS = 10 * 60 * 1000;            // 10 min
export const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days
export const REFRESH_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

// Match for the plaintext token formats.
export const ACCESS_TOKEN_REGEX = /^aurastu_[0-9A-Za-z]{8}_[0-9A-Za-z_-]{40}$/;
export const REFRESH_TOKEN_REGEX = /^aurastr_[0-9A-Za-z]{8}_[0-9A-Za-z_-]{40}$/;

const DUMMY_HASH = createHash("sha256").update("oauth:dummy:v1").digest("hex");

function pepper(): string {
  const p = process.env.AURA_PAT_PEPPER;
  if (!p || p.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AURA_PAT_PEPPER required (≥32 chars) for OAuth token hashing"
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

function issueTokenPair(): { prefix: string; secret: string } {
  const prefix = base62(TOKEN_PREFIX_LEN);
  const raw = randomBytes(30).toString("base64url").slice(0, TOKEN_SECRET_LEN);
  const secret = raw.padEnd(TOKEN_SECRET_LEN, "A");
  return { prefix, secret };
}

// ─── Client authentication ───────────────────────────────────────────────

/**
 * Resolve client_id + client_secret from either the Authorization: Basic
 * header (RFC default) or the POST body (per-client config). Returns the
 * validated OAuthClient row, or an error code for /oauth/token's response.
 */
export async function authenticateClient(opts: {
  basicAuthHeader?: string | null;
  bodyClientId?: string | null;
  bodyClientSecret?: string | null;
}): Promise<
  | { ok: true; client: { id: string; scopes: string[]; redirectUris: string[]; pkceRequired: boolean } }
  | { ok: false; error: "invalid_client" }
> {
  let clientId: string | null = null;
  let clientSecret: string | null = null;

  if (opts.basicAuthHeader?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(opts.basicAuthHeader.slice(6), "base64").toString("utf8");
      const sep = decoded.indexOf(":");
      if (sep > 0) {
        clientId = decodeURIComponent(decoded.slice(0, sep));
        clientSecret = decodeURIComponent(decoded.slice(sep + 1));
      }
    } catch {
      // fall through to body
    }
  }
  if (!clientId && opts.bodyClientId) clientId = opts.bodyClientId;
  if (!clientSecret && opts.bodyClientSecret) clientSecret = opts.bodyClientSecret;

  if (!clientId || !clientSecret) return { ok: false, error: "invalid_client" };

  const row = await db.oAuthClient.findUnique({ where: { id: clientId } });
  if (!row) {
    // Constant-time decoy to avoid leaking client existence.
    const dummy = Buffer.from(DUMMY_HASH, "hex");
    timingSafeEqual(dummy, dummy);
    return { ok: false, error: "invalid_client" };
  }

  // Client secret comparison — bcrypt would be better but we keep the PAT
  // pepper+sha256 pattern for dependency parity. Secrets are high-entropy
  // random so offline brute force is not feasible on single-round SHA-256.
  const submitted = hashSecret(clientSecret);
  const a = Buffer.from(submitted, "hex");
  const b = Buffer.from(row.secretHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "invalid_client" };
  }

  return {
    ok: true,
    client: {
      id: row.id,
      scopes: JSON.parse(row.scopes) as string[],
      redirectUris: JSON.parse(row.redirectUris) as string[],
      pkceRequired: row.pkceRequired,
    },
  };
}

/**
 * Hash a plaintext client_secret for seed/admin tooling. Export so
 * `prisma/seed.ts` can write initial rows without importing crypto directly.
 */
export function hashClientSecret(plaintext: string): string {
  return hashSecret(plaintext);
}

// ─── Authorization code ──────────────────────────────────────────────────

export async function issueAuthCode(params: {
  studentId: string;
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
      studentId: params.studentId,
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

/**
 * One-shot consumption of an auth code. Verifies PKCE, redirect_uri match,
 * and client binding. Returns the underlying grant or an error code suitable
 * for /oauth/token's `{error}` response body.
 */
export async function consumeAuthCode(params: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier?: string;
}): Promise<
  | { ok: true; studentId: string; scope: string }
  | { ok: false; error: "invalid_grant" }
> {
  const row = await db.oAuthAuthCode.findUnique({ where: { code: params.code } });
  if (!row) return { ok: false, error: "invalid_grant" };
  if (row.consumedAt) {
    // RFC 6749 §10.5 — replay: treat as invalid. Production implementations
    // also revoke tokens issued from this code; we defer that to background
    // cleanup.
    return { ok: false, error: "invalid_grant" };
  }
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, error: "invalid_grant" };
  if (row.clientId !== params.clientId) return { ok: false, error: "invalid_grant" };
  if (row.redirectUri !== params.redirectUri) return { ok: false, error: "invalid_grant" };
  // Subject discriminator (2026-04-24): teacher 코드를 student token endpoint
  // 으로 잘못 보낸 경우 → invalid_grant.
  if (!row.studentId) return { ok: false, error: "invalid_grant" };

  if (row.codeChallengeMethod !== "none") {
    if (!params.codeVerifier) return { ok: false, error: "invalid_grant" };
    // PKCE S256: code_challenge === BASE64URL(SHA256(code_verifier))
    const challenge = createHash("sha256").update(params.codeVerifier).digest("base64url");
    if (challenge !== row.codeChallenge) return { ok: false, error: "invalid_grant" };
  }

  await db.oAuthAuthCode.update({
    where: { code: params.code },
    data: { consumedAt: new Date() },
  });

  return { ok: true, studentId: row.studentId, scope: row.scope };
}

// ─── Access + refresh token issuance ─────────────────────────────────────

export interface TokenPairResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
  tokenType: "Bearer";
}

export async function issueTokenPairFor(params: {
  studentId: string;
  clientId: string;
  scope: string;
  parentRefreshHash?: string | null;
}): Promise<TokenPairResult> {
  const access = issueTokenPair();
  const refresh = issueTokenPair();
  const now = Date.now();

  await db.$transaction([
    db.oAuthAccessToken.create({
      data: {
        tokenHash: hashSecret(access.secret),
        tokenPrefix: access.prefix,
        studentId: params.studentId,
        clientId: params.clientId,
        scope: params.scope,
        expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
      },
    }),
    db.oAuthRefreshToken.create({
      data: {
        tokenHash: hashSecret(refresh.secret),
        tokenPrefix: refresh.prefix,
        studentId: params.studentId,
        clientId: params.clientId,
        scope: params.scope,
        expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
        parentTokenHash: params.parentRefreshHash ?? null,
      },
    }),
  ]);

  return {
    accessToken: `${ACCESS_TOKEN_FULL_PREFIX}${access.prefix}_${access.secret}`,
    refreshToken: `${REFRESH_TOKEN_FULL_PREFIX}${refresh.prefix}_${refresh.secret}`,
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope: params.scope,
    tokenType: "Bearer",
  };
}

// ─── Refresh grant ───────────────────────────────────────────────────────

export async function rotateRefreshToken(params: {
  refreshPlaintext: string;
  clientId: string;
}): Promise<
  | { ok: true; pair: TokenPairResult }
  | { ok: false; error: "invalid_grant" }
> {
  if (!REFRESH_TOKEN_REGEX.test(params.refreshPlaintext)) {
    return { ok: false, error: "invalid_grant" };
  }
  const prefix = params.refreshPlaintext.slice(
    REFRESH_TOKEN_FULL_PREFIX.length,
    REFRESH_TOKEN_FULL_PREFIX.length + TOKEN_PREFIX_LEN
  );
  const secret = params.refreshPlaintext.slice(REFRESH_TOKEN_FULL_PREFIX.length + TOKEN_PREFIX_LEN + 1);

  const row = await db.oAuthRefreshToken.findUnique({ where: { tokenPrefix: prefix } });
  if (!row || !row.studentId) {
    // Dummy compare to avoid prefix-leak timing.
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
    // Reuse-after-revoke: hard-kill the chain. We revoke every access token
    // that shares studentId+clientId+scope, because we cannot distinguish
    // compromised from legitimate consumers once a reuse happens.
    await db.oAuthAccessToken.updateMany({
      where: {
        studentId: row.studentId,
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

  // Rotate: revoke old refresh, issue new pair.
  await db.oAuthRefreshToken.update({
    where: { tokenHash: row.tokenHash },
    data: { revokedAt: new Date() },
  });

  // Best-effort revoke of prior access tokens for this chain — narrow to the
  // same student+client+scope so concurrent sessions aren't interrupted.
  await db.oAuthAccessToken.updateMany({
    where: {
      studentId: row.studentId,
      clientId: row.clientId,
      scope: row.scope,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  const pair = await issueTokenPairFor({
    studentId: row.studentId,
    clientId: row.clientId,
    scope: row.scope,
    parentRefreshHash: row.tokenHash,
  });

  return { ok: true, pair };
}

// ─── Access token verification (for /api/external/*) ────────────────────

export async function verifyAccessToken(plaintext: string): Promise<
  | { ok: true; studentId: string; clientId: string; scope: string; tokenHash: string }
  | { ok: false; code: "invalid_token_format" | "invalid_token" | "revoked" | "expired" }
> {
  if (!ACCESS_TOKEN_REGEX.test(plaintext)) {
    return { ok: false, code: "invalid_token_format" };
  }
  const prefix = plaintext.slice(
    ACCESS_TOKEN_FULL_PREFIX.length,
    ACCESS_TOKEN_FULL_PREFIX.length + TOKEN_PREFIX_LEN
  );
  const secret = plaintext.slice(ACCESS_TOKEN_FULL_PREFIX.length + TOKEN_PREFIX_LEN + 1);

  const row = await db.oAuthAccessToken.findUnique({ where: { tokenPrefix: prefix } });
  if (!row || !row.studentId) {
    const dummy = Buffer.from(DUMMY_HASH, "hex");
    timingSafeEqual(dummy, dummy);
    return { ok: false, code: "invalid_token" };
  }
  const a = Buffer.from(hashSecret(secret), "hex");
  const b = Buffer.from(row.tokenHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, code: "invalid_token" };
  }
  if (row.revokedAt) return { ok: false, code: "revoked" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, code: "expired" };

  // Touch lastUsedAt (fire-and-forget — no await).
  void db.oAuthAccessToken
    .update({ where: { tokenHash: row.tokenHash }, data: { lastUsedAt: new Date() } })
    .catch(() => void 0);

  return {
    ok: true,
    studentId: row.studentId,
    clientId: row.clientId,
    scope: row.scope,
    tokenHash: row.tokenHash,
  };
}

// ─── Revocation ──────────────────────────────────────────────────────────

export async function revokeToken(plaintext: string): Promise<void> {
  // RFC 7009: revocation is "best effort" — we respond 200 regardless.
  if (ACCESS_TOKEN_REGEX.test(plaintext)) {
    const prefix = plaintext.slice(
      ACCESS_TOKEN_FULL_PREFIX.length,
      ACCESS_TOKEN_FULL_PREFIX.length + TOKEN_PREFIX_LEN
    );
    await db.oAuthAccessToken.updateMany({
      where: { tokenPrefix: prefix, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return;
  }
  if (REFRESH_TOKEN_REGEX.test(plaintext)) {
    const prefix = plaintext.slice(
      REFRESH_TOKEN_FULL_PREFIX.length,
      REFRESH_TOKEN_FULL_PREFIX.length + TOKEN_PREFIX_LEN
    );
    await db.oAuthRefreshToken.updateMany({
      where: { tokenPrefix: prefix, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return;
  }
  // Unknown format — swallow (RFC).
}
