import { generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsertParentFromOAuth: vi.fn(),
  createParentSession: vi.fn(),
  fetchAppleJwks: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/parent-oauth", () => ({
  upsertParentFromOAuth: mocks.upsertParentFromOAuth,
}));
vi.mock("@/lib/parent-session", () => ({
  createParentSession: mocks.createParentSession,
}));

import { APPLE_IDENTITY_ISSUER, APPLE_PARENT_AUDIENCE } from "@/lib/parent-apple-auth";
import { POST } from "./route";

const signingKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const appleJwk = {
  ...signingKeys.publicKey.export({ format: "jwk" }),
  kid: "apple-route-test-key",
  alg: "RS256",
  use: "sig",
};

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function makeIdentityToken(overrides: Record<string, unknown> = {}): string {
  const header = encode({
    alg: "RS256",
    kid: "apple-route-test-key",
    typ: "JWT",
  });
  const payload = encode({
    iss: APPLE_IDENTITY_ISSUER,
    aud: APPLE_PARENT_AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + 600,
    sub: "apple-route-sub",
    email: "route123@privaterelay.appleid.com",
    email_verified: true,
    ...overrides,
  });
  const signingInput = `${header}.${payload}`;
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(signingInput),
    signingKeys.privateKey,
  ).toString("base64url");
  return `${signingInput}.${signature}`;
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/parent/auth/apple", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "apple-route-test",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchAppleJwks.mockReset();
  mocks.fetchAppleJwks.mockResolvedValue(
    new Response(JSON.stringify({ keys: [appleJwk] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", mocks.fetchAppleJwks);
  mocks.upsertParentFromOAuth.mockResolvedValue({
    parentId: "parent-route-1",
    isNewParent: true,
  });
  mocks.createParentSession.mockResolvedValue({
    token: "parent-session-token",
    expiresAt: new Date("2026-08-11T00:00:00.000Z"),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/parent/auth/apple", () => {
  it("verifies the Apple identity, links the stable sub, and creates a session", async () => {
    const response = await POST(
      request({
        identityToken: makeIdentityToken(),
        authorizationCode: null,
        displayName: "  보호자  ",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      token: "parent-session-token",
      expiresAt: "2026-08-11T00:00:00.000Z",
      isNewParent: true,
    });
    expect(mocks.upsertParentFromOAuth).toHaveBeenCalledWith("apple", {
      providerAccountId: "apple-route-sub",
      email: "route123@privaterelay.appleid.com",
      emailVerified: true,
      displayName: "보호자",
      profileImage: null,
    });
    expect(mocks.createParentSession).toHaveBeenCalledWith({
      parentId: "parent-route-1",
      userAgent: "apple-route-test",
      ipHash: null,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects invalid audience before any account or session mutation", async () => {
    const response = await POST(
      request({
        identityToken: makeIdentityToken({ aud: "com.example.other" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_identity_token",
    });
    expect(mocks.upsertParentFromOAuth).not.toHaveBeenCalled();
    expect(mocks.createParentSession).not.toHaveBeenCalled();
  });

  it.each([
    ["missing identity token", {}],
    ["malformed JSON", "not-json"],
    ["invalid authorization code shape", {
      identityToken: makeIdentityToken(),
      authorizationCode: 42,
    }],
    ["oversized identity token", { identityToken: "a".repeat(16_385) }],
  ])("rejects %s as invalid input", async (_label, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
    expect(mocks.upsertParentFromOAuth).not.toHaveBeenCalled();
    expect(mocks.createParentSession).not.toHaveBeenCalled();
  });
});
