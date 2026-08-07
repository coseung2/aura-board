import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

const HASH_PREFIX = "scrypt";
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 32;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{3,31}$/;
const DUMMY_SALT = Buffer.alloc(SALT_BYTES, 0x5a);
const DUMMY_EXPECTED = Buffer.alloc(DERIVED_KEY_BYTES, 0xa5);

function derive(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function parsePasswordHash(value: string): {
  salt: Buffer;
  expected: Buffer;
} | null {
  const [prefix, saltValue, hashValue, extra] = value.split("$");
  if (prefix !== HASH_PREFIX || !saltValue || !hashValue || extra) return null;
  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    if (salt.length !== SALT_BYTES || expected.length !== DERIVED_KEY_BYTES) {
      return null;
    }
    return { salt, expected };
  } catch {
    return null;
  }
}

export function normalizePasswordUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidPasswordUsername(value: string): boolean {
  return USERNAME_PATTERN.test(normalizePasswordUsername(value));
}

export function isValidAccountPassword(value: string): boolean {
  return value.length >= 8 && value.length <= 72;
}

export function localPrincipalEmail(username: string): string {
  const normalized = normalizePasswordUsername(username);
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 32);
  return `local-${digest}@accounts.aura-board.invalid`;
}

export async function createPasswordHash(password: string): Promise<string> {
  if (!isValidAccountPassword(password)) {
    throw new Error("Password must be between 8 and 72 characters");
  }
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, DERIVED_KEY_BYTES);
  return `${HASH_PREFIX}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPasswordHash(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const parsed = parsePasswordHash(encodedHash);
  const salt = parsed?.salt ?? DUMMY_SALT;
  const expected = parsed?.expected ?? DUMMY_EXPECTED;
  const actual = await derive(password, salt, expected.length);
  return Boolean(parsed) && timingSafeEqual(actual, expected);
}
