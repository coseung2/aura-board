import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  resolveCanvaEmbedUrl: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/canva", () => ({
  canvaGetDesign: vi.fn(),
  extractCanvaDesignId: vi.fn(() => null),
  expandCanvaShortLink: vi.fn(async (url: string) => url),
  getAccessToken: vi.fn(),
  resolveCanvaEmbedUrl: mocks.resolveCanvaEmbedUrl,
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

import { GET } from "./route";

const designUrl = "https://www.canva.com/design/DESIGN123/share456/view";

function requestForDesign() {
  const params = new URLSearchParams({ design: designUrl, w: "640" });
  return new Request(`https://example.test/api/canva/thumbnail?${params}`);
}

function htmlResponse(html: string) {
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

function imageResponse() {
  return new Response(new Uint8Array([137, 80, 78, 71]), {
    status: 200,
    headers: { "Content-Type": "image/png" },
  });
}

describe("GET /api/canva/thumbnail public design page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.resolveCanvaEmbedUrl.mockResolvedValue(null);
    mocks.getCurrentUser.mockRejectedValue(new Error("unauthenticated"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers the JSON-escaped document-image URL explicitly marked page=1", async () => {
    const pageOne =
      "https://media.canva.com/v2/document-image/page-one.png?token=abc&page=1&width=640";
    const legacy =
      "https://document-export.canva.com/export/thumbnail/legacy.png?token=old";
    const html = `<script>{
      "pageTwo":"https://media.canva.com/v2/document-image/page-two.png?token=abc&page=2&width=640",
      "legacy":"${legacy}",
      "pageOne":"https:\\/\\/media.canva.com\\/v2\\/document-image\\/page-one.png?token=abc\\u0026page\\u003d1\\u0026width\\u003d640"
    }</script>`;
    mocks.fetch
      .mockResolvedValueOnce(htmlResponse(html))
      .mockResolvedValueOnce(imageResponse());

    const response = await GET(requestForDesign());

    expect(response.status).toBe(200);
    expect(String(mocks.fetch.mock.calls[1][0])).toBe(pageOne);
  });

  it("extracts a page=1 document-image URL with HTML-escaped query separators", async () => {
    const pageOne =
      "https://media.canva.com/v2/document-image/html-escaped.png?token=abc&page=1&width=320";
    mocks.fetch
      .mockResolvedValueOnce(
        htmlResponse(
          '<meta content="https://media.canva.com/v2/document-image/html-escaped.png?token=abc&amp;page=1&amp;width=320">',
        ),
      )
      .mockResolvedValueOnce(imageResponse());

    const response = await GET(requestForDesign());

    expect(response.status).toBe(200);
    expect(String(mocks.fetch.mock.calls[1][0])).toBe(pageOne);
  });

  it("does not mistake another document page for page one and keeps legacy fallback", async () => {
    const legacy =
      "https://document-export.canva.com/export/thumbnail/legacy.webp?token=old";
    const html = `<script>{
      "pageTwo":"https://media.canva.com/v2/document-image/page-two.png?token=abc&page=2&width=640",
      "legacy":"${legacy}"
    }</script>`;
    mocks.fetch
      .mockResolvedValueOnce(htmlResponse(html))
      .mockResolvedValueOnce(imageResponse());

    const response = await GET(requestForDesign());

    expect(response.status).toBe(200);
    expect(String(mocks.fetch.mock.calls[1][0])).toBe(legacy);
  });
});
