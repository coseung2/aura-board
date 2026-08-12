import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signStatePayload } from "@/lib/parent-oauth-state";

const mocks = vi.hoisted(() => ({
  verifyAppleIdentityToken: vi.fn(),
  upsertParentFromOAuth: vi.fn(),
  createParentSession: vi.fn(),
  fetch: vi.fn(),
  getCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mocks.getCookie,
    delete: mocks.deleteCookie,
  })),
}));

vi.mock("@/lib/parent-apple-auth", () => ({
  verifyAppleIdentityToken: mocks.verifyAppleIdentityToken,
}));
vi.mock("@/lib/parent-oauth", () => ({
  upsertParentFromOAuth: mocks.upsertParentFromOAuth,
}));
vi.mock("@/lib/parent-session", () => ({
  createParentSession: mocks.createParentSession,
}));

import { POST } from "./route";

function callbackRequest(overrides: Record<string, string> = {}) {
  const state = signStatePayload(
    { state: "state-1", exp: Date.now() + 60_000 },
    "state-secret",
  );
  const form = new URLSearchParams({ code: "apple-code", state, ...overrides });
  mocks.getCookie.mockReturnValue({ value: overrides.state ?? state });
  return new Request(
    "https://aura-board.com/api/parent/auth/apple/web/callback",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "apple-web-test",
      },
      body: form,
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_APPLE_ID", "com.auraboard.web");
  vi.stubEnv("AUTH_APPLE_SECRET", "signed-client-secret");
  vi.stubEnv("AUTH_SECRET", "state-secret");
  mocks.fetch.mockResolvedValue(
    new Response(JSON.stringify({ id_token: "apple-id-token" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.verifyAppleIdentityToken.mockResolvedValue({
    sub: "apple-web-sub",
    email: "relay@privaterelay.appleid.com",
    emailVerified: true,
  });
  mocks.upsertParentFromOAuth.mockResolvedValue({
    parentId: "parent-1",
    isNewParent: true,
  });
  mocks.createParentSession.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/parent/auth/apple/web/callback", () => {
  it("exchanges the code, verifies the Services ID audience, and issues a parent session", async () => {
    const response = await POST(callbackRequest());

    expect(response.headers.get("location")).toBe(
      "https://aura-board.com/parent/home",
    );
    expect(mocks.verifyAppleIdentityToken).toHaveBeenCalledWith(
      "apple-id-token",
      "com.auraboard.web",
    );
    expect(mocks.upsertParentFromOAuth).toHaveBeenCalledWith("apple", {
      providerAccountId: "apple-web-sub",
      email: "relay@privaterelay.appleid.com",
      emailVerified: true,
      displayName: null,
      profileImage: null,
    });
    expect(mocks.createParentSession).toHaveBeenCalledWith({
      parentId: "parent-1",
      userAgent: "apple-web-test",
      ipHash: null,
    });
    expect(mocks.deleteCookie).toHaveBeenCalledWith("parent_apple_web_state");
  });

  it("rejects an invalid signed state before token exchange", async () => {
    const response = await POST(callbackRequest({ state: "invalid" }));
    expect(response.headers.get("location")).toBe(
      "https://aura-board.com/login?role=parent&error=invalid_state",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
