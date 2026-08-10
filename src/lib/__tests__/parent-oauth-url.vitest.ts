import { afterEach, describe, expect, it, vi } from "vitest";
import { getCallbackUrl, normalizeParentOAuthBaseUrl } from "../parent-oauth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parent OAuth callback base URL", () => {
  it("normalizes the Vercel alias to the canonical origin", () => {
    expect(normalizeParentOAuthBaseUrl("https://aura-board-app.vercel.app/")).toBe(
      "https://aura-board.com",
    );
  });

  it("preserves explicit localhost and non-alias overrides", () => {
    expect(normalizeParentOAuthBaseUrl("http://localhost:3000/")).toBe(
      "http://localhost:3000",
    );
    expect(normalizeParentOAuthBaseUrl("https://preview.example.test/")).toBe(
      "https://preview.example.test",
    );
  });

  it("uses the canonical origin when production overrides are empty", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PARENT_OAUTH_REDIRECT_BASE_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");

    expect(getCallbackUrl("google")).toBe(
      "https://aura-board.com/api/parent/auth/callback/google",
    );
  });
});
