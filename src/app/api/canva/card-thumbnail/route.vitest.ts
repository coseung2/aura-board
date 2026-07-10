import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/canva", () => ({
  expandCanvaShortLink: vi.fn(async (url: string) => url),
  isCanvaDesignUrl: vi.fn(() => true),
}));

import { GET } from "./route";

const DESIGN_URL = "https://www.canva.com/design/example/share-token/view";

function request() {
  return new Request(
    `https://example.test/api/canva/card-thumbnail?design=${encodeURIComponent(DESIGN_URL)}&w=320`,
  );
}

describe("GET /api/canva/card-thumbnail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["private, max-age=0", "no-store"])(
    "does not promote an upstream %s thumbnail to shared cache",
    async (upstreamCacheControl) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response("private-image", {
              headers: {
                "Content-Type": "image/webp",
                "Cache-Control": upstreamCacheControl,
              },
            }),
        ),
      );

      const response = await GET(request());

      expect(response.headers.get("x-canva-thumbnail-source")).toBe("resolved");
      expect(response.headers.get("cache-control")).toBe(
        "private, no-store, max-age=0",
      );
      expect(response.headers.get("vary")).toBe("Cookie, Authorization");
    },
  );

  it("only uses shared caching when the upstream response is explicitly public", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("public-image", {
            headers: {
              "Content-Type": "image/webp",
              "Cache-Control": "public, max-age=86400, s-maxage=86400",
            },
          }),
      ),
    );

    const response = await GET(request());

    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(response.headers.get("vary")).toBeNull();
  });

  it("prevents fallback thumbnails from entering shared caches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    const response = await GET(request());

    expect(response.headers.get("x-canva-thumbnail-source")).toBe("fallback");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  });
});
