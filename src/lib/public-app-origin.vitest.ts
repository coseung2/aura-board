import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configuredPublicAppOrigin,
  publicAppOriginFromHeaders,
  requestPublicAppOrigin,
} from "./public-app-origin";

afterEach(() => vi.unstubAllEnvs());

describe("public app origin", () => {
  it("prefers the configured server-side public origin", () => {
    vi.stubEnv("AURA_BOARD_BASE_URL", "https://aura-board.com/some/path");

    expect(
      publicAppOriginFromHeaders(
        new Headers({
          "x-forwarded-proto": "http",
          "x-forwarded-host": "localhost:3000",
        }),
      ),
    ).toBe("https://aura-board.com");
  });

  it("falls back to the configured public client origin", () => {
    vi.stubEnv("AURA_BOARD_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", "https://preview.aura-board.com/path");

    expect(configuredPublicAppOrigin()).toBe("https://preview.aura-board.com");
  });

  it("derives the public origin from trusted proxy headers", () => {
    vi.stubEnv("AURA_BOARD_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", "");

    const request = new Request("http://localhost:3000/qr/token", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "aura-board.com",
        host: "localhost:3000",
      },
    });

    expect(requestPublicAppOrigin(request)).toBe("https://aura-board.com");
  });

  it("keeps direct loopback development requests on HTTP", () => {
    vi.stubEnv("AURA_BOARD_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", "");

    const request = new Request("http://localhost:3000/qr/token", {
      headers: { host: "localhost:3000" },
    });

    expect(requestPublicAppOrigin(request)).toBe("http://localhost:3000");
  });
});
