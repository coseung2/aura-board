import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function encryptionKey(): Buffer {
  const secret = process.env.CANVA_TOKEN_ENCRYPTION_KEY ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("CANVA_TOKEN_ENCRYPTION_KEY or AUTH_SECRET must be configured");
  }
  return createHash("sha256").update(`canva-connect:${secret}`).digest();
}

export function isEncryptedCanvaSecret(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptCanvaSecret(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, authTag, ciphertext]).toString("base64")}`;
}

export function decryptCanvaSecret(storedValue: string): string {
  if (!isEncryptedCanvaSecret(storedValue)) return storedValue;

  const payload = Buffer.from(storedValue.slice(PREFIX.length), "base64");
  if (payload.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted Canva secret");
  }

  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
