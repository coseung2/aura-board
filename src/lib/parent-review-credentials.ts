import "server-only";

import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";

const HASH_PREFIX = "scrypt";
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 64;
const MAX_CODE_LENGTH = 256;

/**
 * Review-login configuration deliberately contains no credential plaintext.
 * The parent identity is a non-secret selector for an already-provisioned
 * Parent row; the access code is represented only by a salted scrypt hash.
 */
export type ParentReviewCredentialConfig = {
  parentId: string | null;
  email: string | null;
  codeHash: string;
};

type ParsedHash = { salt: Buffer; expected: Buffer };

function envValue(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

export function normalizeParentReviewCode(code: string): string {
  return code.trim().toUpperCase();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseHash(encoded: string): ParsedHash | null {
  const [prefix, saltRaw, hashRaw, ...rest] = encoded.split("$");
  if (prefix !== HASH_PREFIX || !saltRaw || !hashRaw || rest.length > 0) {
    return null;
  }

  const salt = Buffer.from(saltRaw, "base64url");
  const expected = Buffer.from(hashRaw, "base64url");
  if (salt.length < SALT_BYTES || expected.length !== DERIVED_KEY_BYTES) {
    return null;
  }
  return { salt, expected };
}

/** Generate a server configuration value; the resulting plaintext must stay outside the repository. */
export function createParentReviewCodeHash(
  code: string,
  salt: Buffer = randomBytes(SALT_BYTES),
): string {
  const normalized = normalizeParentReviewCode(code);
  if (!normalized || normalized.length > MAX_CODE_LENGTH) {
    throw new Error("Review code must be between 1 and 256 characters");
  }
  if (salt.length < SALT_BYTES) {
    throw new Error("Review code salt must be at least 16 bytes");
  }

  const derived = scryptSync(normalized, salt, DERIVED_KEY_BYTES);
  return `${HASH_PREFIX}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

/**
 * Verify a code against a salted scrypt value. Malformed/missing hashes still
 * take a dummy derivation so an unset configuration is not an obvious fast
 * path. No caller receives a distinction between malformed and mismatched
 * credentials.
 */
export function verifyParentReviewCode(code: string, encodedHash: string): boolean {
  const normalized = normalizeParentReviewCode(code);
  if (!normalized || normalized.length > MAX_CODE_LENGTH) return false;

  const parsed = parseHash(encodedHash);
  if (!parsed) {
    scryptSync(normalized, Buffer.alloc(SALT_BYTES), DERIVED_KEY_BYTES);
    return false;
  }

  const actual = scryptSync(normalized, parsed.salt, parsed.expected.length);
  return timingSafeEqual(actual, parsed.expected);
}

/**
 * Read the fixed review parent selector and hashed code from server-only env.
 * The aliases keep preview deployments compatible with either naming used by
 * the deployment configuration; all values remain server-side.
 */
export function getParentReviewCredentialConfig(): ParentReviewCredentialConfig | null {
  const parentId = envValue(
    "PARENT_REVIEW_PARENT_ID",
    "PARENT_REVIEW_LOGIN_PARENT_ID",
  );
  const emailRaw = envValue(
    "PARENT_REVIEW_EMAIL",
    "PARENT_REVIEW_LOGIN_EMAIL",
  );
  const codeHash = envValue(
    "PARENT_REVIEW_CODE_HASH",
    "PARENT_REVIEW_ACCESS_CODE_HASH",
    "PARENT_REVIEW_LOGIN_CODE_HASH",
  );
  const parsed = parseHash(codeHash);
  const email = emailRaw ? normalizeEmail(emailRaw) : null;

  if ((!parentId && !email) || !parsed) return null;
  return { parentId: parentId || null, email, codeHash };
}

/** Stable, non-reversible key for the code bucket in a rate limiter. */
export function hashParentReviewCode(code: string): string {
  return createHash("sha256")
    .update(normalizeParentReviewCode(code))
    .digest("hex")
    .slice(0, 32);
}

export function parentReviewIdentityMatches(
  parent: { id: string; email: string },
  config: ParentReviewCredentialConfig,
): boolean {
  if (config.parentId && parent.id !== config.parentId) return false;
  if (config.email && normalizeEmail(parent.email) !== config.email) return false;
  return true;
}

