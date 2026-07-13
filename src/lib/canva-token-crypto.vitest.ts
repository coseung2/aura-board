import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptCanvaSecret,
  encryptCanvaSecret,
  isEncryptedCanvaSecret,
} from "./canva-token-crypto";

const originalCanvaKey = process.env.CANVA_TOKEN_ENCRYPTION_KEY;
const originalAuthSecret = process.env.AUTH_SECRET;

describe("Canva token encryption", () => {
  beforeEach(() => {
    process.env.CANVA_TOKEN_ENCRYPTION_KEY = "test-canva-key-at-least-32-characters-long";
    process.env.AUTH_SECRET = "test-auth-secret";
  });

  afterEach(() => {
    if (originalCanvaKey === undefined) delete process.env.CANVA_TOKEN_ENCRYPTION_KEY;
    else process.env.CANVA_TOKEN_ENCRYPTION_KEY = originalCanvaKey;
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
  });

  it("round-trips an encrypted secret without storing plaintext", () => {
    const encrypted = encryptCanvaSecret("refresh-token-value");

    expect(isEncryptedCanvaSecret(encrypted)).toBe(true);
    expect(encrypted).not.toContain("refresh-token-value");
    expect(decryptCanvaSecret(encrypted)).toBe("refresh-token-value");
  });

  it("uses a random IV for each encryption", () => {
    expect(encryptCanvaSecret("same-token")).not.toBe(
      encryptCanvaSecret("same-token"),
    );
  });

  it("reads legacy plaintext so it can be migrated lazily", () => {
    expect(isEncryptedCanvaSecret("legacy-token")).toBe(false);
    expect(decryptCanvaSecret("legacy-token")).toBe("legacy-token");
  });

  it("rejects authenticated ciphertext that was modified", () => {
    const encrypted = encryptCanvaSecret("access-token");
    const prefix = "enc:v1:";
    const payload = Buffer.from(encrypted.slice(prefix.length), "base64");
    payload[payload.length - 1] ^= 1;
    const tampered = `${prefix}${payload.toString("base64")}`;

    expect(() => decryptCanvaSecret(tampered)).toThrow();
  });
});
