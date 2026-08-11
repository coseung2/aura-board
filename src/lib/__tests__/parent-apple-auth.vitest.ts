import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  APPLE_IDENTITY_ISSUER,
  APPLE_PARENT_AUDIENCE,
  AppleIdentityTokenError,
  verifyAppleIdentityToken,
} from "../parent-apple-auth";

const signingKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const invalidSigningKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const appleJwk = {
  ...signingKeys.publicKey.export({ format: "jwk" }),
  kid: "apple-test-key",
  alg: "RS256",
  use: "sig",
};

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function makeIdentityToken(
  overrides: Record<string, unknown> = {},
  key = signingKeys.privateKey,
): string {
  const header = encode({ alg: "RS256", kid: "apple-test-key", typ: "JWT" });
  const payload = encode({
    iss: APPLE_IDENTITY_ISSUER,
    aud: APPLE_PARENT_AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + 600,
    sub: "apple-sub-1",
    email: "abc123@privaterelay.appleid.com",
    email_verified: true,
    ...overrides,
  });
  const signingInput = `${header}.${payload}`;
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(signingInput),
    key,
  ).toString("base64url");
  return `${signingInput}.${signature}`;
}

const fetchAppleJwks = vi.fn();

beforeEach(() => {
  fetchAppleJwks.mockReset();
  fetchAppleJwks.mockResolvedValue(
    new Response(JSON.stringify({ keys: [appleJwk] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchAppleJwks);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyAppleIdentityToken", () => {
  it("accepts a signed Apple identity and a verified private relay email", async () => {
    await expect(
      verifyAppleIdentityToken(makeIdentityToken()),
    ).resolves.toEqual({
      sub: "apple-sub-1",
      email: "abc123@privaterelay.appleid.com",
      emailVerified: true,
    });
  });

  it("does not trust an email claim without email_verified", async () => {
    await expect(
      verifyAppleIdentityToken(
        makeIdentityToken({ email_verified: false }),
      ),
    ).resolves.toEqual({
      sub: "apple-sub-1",
      email: null,
      emailVerified: false,
    });
  });

  it.each([
    ["audience", { aud: "com.example.other" }],
    ["issuer", { iss: "https://example.test" }],
    ["expired", { exp: Math.floor(Date.now() / 1000) - 1 }],
    ["missing subject", { sub: "" }],
  ])("rejects a token with an invalid %s claim", async (_label, claims) => {
    await expect(
      verifyAppleIdentityToken(makeIdentityToken(claims)),
    ).rejects.toBeInstanceOf(AppleIdentityTokenError);
  });

  it("rejects a token with an invalid signature", async () => {
    await expect(
      verifyAppleIdentityToken(makeIdentityToken({}, invalidSigningKeys.privateKey)),
    ).rejects.toMatchObject({ code: "invalid_identity_token" });
  });

  it.each(["", "not-a-jwt", "a".repeat(16_385)])(
    "rejects malformed or bounded-input identity tokens",
    async (token) => {
      await expect(verifyAppleIdentityToken(token)).rejects.toMatchObject({
        code: "invalid_identity_token",
      });
    },
  );
});
