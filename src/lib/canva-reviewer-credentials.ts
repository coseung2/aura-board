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
const MAX_PASSWORD_LENGTH = 256;

type ReviewerCredentialConfig = {
  email: string;
  passwordHash: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function stableDigest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function parsePasswordHash(value: string): {
  salt: Buffer;
  expected: Buffer;
} | null {
  const [prefix, saltRaw, hashRaw, ...rest] = value.split("$");
  if (prefix !== HASH_PREFIX || !saltRaw || !hashRaw || rest.length > 0) {
    return null;
  }

  try {
    const salt = Buffer.from(saltRaw, "base64url");
    const expected = Buffer.from(hashRaw, "base64url");
    if (salt.length < SALT_BYTES || expected.length !== DERIVED_KEY_BYTES) {
      return null;
    }
    return { salt, expected };
  } catch {
    return null;
  }
}

export function createCanvaReviewerPasswordHash(
  password: string,
  salt: Buffer = randomBytes(SALT_BYTES),
): string {
  if (password.length < 16 || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error("Reviewer password must be between 16 and 256 characters");
  }
  if (salt.length < SALT_BYTES) {
    throw new Error("Reviewer password salt must be at least 16 bytes");
  }

  const derived = scryptSync(password, salt, DERIVED_KEY_BYTES);
  return `${HASH_PREFIX}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyCanvaReviewerPassword(
  password: string,
  encodedHash: string,
): boolean {
  if (!password || password.length > MAX_PASSWORD_LENGTH) return false;
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) return false;

  const actual = scryptSync(password, parsed.salt, parsed.expected.length);
  return timingSafeEqual(actual, parsed.expected);
}

export function getCanvaReviewerCredentialConfig(): ReviewerCredentialConfig | null {
  const email = normalizeEmail(process.env.CANVA_REVIEWER_EMAIL ?? "");
  const passwordHash = process.env.CANVA_REVIEWER_PASSWORD_HASH ?? "";
  if (!email || !parsePasswordHash(passwordHash)) return null;
  return { email, passwordHash };
}

export function verifyConfiguredCanvaReviewer(
  email: string,
  password: string,
): ReviewerCredentialConfig | null {
  const config = getCanvaReviewerCredentialConfig();
  if (!config) return null;

  // Keep wrong-email and right-email attempts on the same password-verification
  // path so the allowlisted address is not exposed through timing differences.
  const passwordMatches = verifyCanvaReviewerPassword(password, config.passwordHash);
  const emailMatches = timingSafeEqual(
    stableDigest(normalizeEmail(email)),
    stableDigest(config.email),
  );
  return passwordMatches && emailMatches ? config : null;
}
