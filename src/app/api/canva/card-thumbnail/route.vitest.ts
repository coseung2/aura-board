import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCanvaThumbnail: vi.fn(),
}));

vi.mock("@/lib/canva", () => ({
  expandCanvaShortLink: vi.fn(async (url: string) => url),
  isCanvaDesignUrl: vi.fn(() => true),
}));

vi.mock("../thumbnail/route", () => ({
  GET: mocks.getCanvaThumbnail,
}));

import { GET } from "./route";

const DESIGN_URL = "https://www.canva.com/design/example/share-token/view";

function request() {
  return new Request(
    `https://example.test/api/canva/card-thumbnail?design=${encodeURIComponent(DESIGN_URL)}&w=320`,
  );
}

describe("GET /api/canva/card-thumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["private, max-age=0", "no-store"])(
    "does not promote an upstream %s thumbnail to shared cache",
    async (upstreamCacheControl) => {
      mocks.getCanvaThumbnail.mockResolvedValueOnce(
        new Response("private-image", {
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": upstreamCacheControl,
          },
        }),
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
    mocks.getCanvaThumbnail.mockResolvedValueOnce(
      new Response("public-image", {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      }),
    );

    const response = await GET(request());

    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(response.headers.get("vary")).toBeNull();
  });

  it("prevents fallback thumbnails from entering shared caches", async () => {
    mocks.getCanvaThumbnail.mockResolvedValueOnce(
      new Response(null, { status: 404 }),
    );

    const response = await GET(request());

    expect(response.headers.get("x-canva-thumbnail-source")).toBe("fallback");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  });

  it("calls the owned thumbnail route directly with the design and width", async () => {
    mocks.getCanvaThumbnail.mockResolvedValueOnce(
      new Response("public-image", {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      }),
    );

    const response = await GET(request());
    const internalRequest = mocks.getCanvaThumbnail.mock.calls[0]?.[0] as Request;
    const internalUrl = new URL(internalRequest.url);

    expect(response.headers.get("x-canva-thumbnail-source")).toBe("resolved");
    expect(internalUrl.pathname).toBe("/api/canva/thumbnail");
    expect(internalUrl.searchParams.get("design")).toBe(DESIGN_URL);
    expect(internalUrl.searchParams.get("w")).toBe("320");
  });
});
