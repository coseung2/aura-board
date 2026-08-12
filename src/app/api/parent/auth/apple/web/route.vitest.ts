import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyStateToken } from "@/lib/parent-oauth-state";

const mocks = vi.hoisted(() => ({ setCookie: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: mocks.setCookie })),
}));
import { GET } from "./route";

beforeEach(() => {
  vi.stubEnv("AUTH_APPLE_ID", "com.auraboard.web");
  vi.stubEnv("AUTH_APPLE_SECRET", "signed-client-secret");
  vi.stubEnv("AUTH_SECRET", "state-secret");
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/parent/auth/apple/web", () => {
  it("creates a signed state and the exact Apple web callback", async () => {
    const response = await GET();
    const location = new URL(response.headers.get("location")!);

    expect(location.origin + location.pathname).toBe(
      "https://appleid.apple.com/auth/authorize",
    );
    expect(location.searchParams.get("client_id")).toBe("com.auraboard.web");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://aura-board.com/api/parent/auth/apple/web/callback",
    );
    expect(location.searchParams.get("response_mode")).toBe("form_post");
    expect(
      verifyStateToken(location.searchParams.get("state")!, "state-secret"),
    ).not.toBeNull();
    expect(mocks.setCookie).toHaveBeenCalledWith(
      "parent_apple_web_state",
      location.searchParams.get("state"),
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: "none" }),
    );
  });

  it("returns to login when Apple web credentials are unavailable", async () => {
    vi.stubEnv("AUTH_APPLE_SECRET", "");
    const response = await GET();
    expect(response.headers.get("location")).toBe(
      "https://aura-board.com/login?role=parent&error=provider_disabled",
    );
  });
});
