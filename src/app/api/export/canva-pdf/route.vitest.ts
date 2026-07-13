import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  limitCanvaExport: vi.fn(),
  getAccessToken: vi.fn(),
  isCanvaConnected: vi.fn(),
  canvaExportDesign: vi.fn(),
  resolveCanvaDesignId: vi.fn(),
  fetch: vi.fn(),
  createPdf: vi.fn(),
  sharp: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/rate-limit-routes", () => ({
  limitCanvaExport: mocks.limitCanvaExport,
}));
vi.mock("@/lib/canva", () => ({
  getAccessToken: mocks.getAccessToken,
  isCanvaConnected: mocks.isCanvaConnected,
  canvaExportDesign: mocks.canvaExportDesign,
  resolveCanvaDesignId: mocks.resolveCanvaDesignId,
}));
vi.mock("pdf-lib", () => ({ PDFDocument: { create: mocks.createPdf } }));
vi.mock("sharp", () => ({ default: mocks.sharp }));

import { POST } from "./route";

const endpoint = "https://aura-board.example/api/export/canva-pdf";

function request(body: unknown) {
  return new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/export/canva-pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.limitCanvaExport.mockResolvedValue({ ok: true });
    mocks.isCanvaConnected.mockResolvedValue(true);
    mocks.getAccessToken.mockResolvedValue("canva-token");
    mocks.resolveCanvaDesignId.mockResolvedValue("design-1");
    mocks.canvaExportDesign.mockResolvedValue(["https://download.canva.example/export.pdf"]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects more than one normalized export item", async () => {
    const response = await POST(
      request({
        layout: "a4-auto",
        items: [
          { type: "image", url: "https://cdn.example/one.png" },
          { type: "image", url: "https://cdn.example/two.png" },
        ],
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "exactly_one_export_item_required",
    });
    expect(mocks.isCanvaConnected).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("passes a single Canva PDF response through byte-for-byte", async () => {
    const sourceBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, 1, 2, 3]);
    mocks.fetch.mockResolvedValue(
      new Response(sourceBytes, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );

    const response = await POST(
      request({
        layout: "a4-fit",
        items: [
          {
            type: "canva",
            url: "https://www.canva.com/design/DESIGN123/share/view",
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...sourceBytes]);
    expect(mocks.resolveCanvaDesignId).toHaveBeenCalledWith(
      "https://www.canva.com/design/DESIGN123/share/view",
    );
    expect(mocks.canvaExportDesign).toHaveBeenCalledWith("canva-token", "design-1", "pdf");
    expect(mocks.fetch).toHaveBeenCalledWith("https://download.canva.example/export.pdf");
    expect(mocks.createPdf).not.toHaveBeenCalled();
  });

  it("rejects Canva exports that return multiple PDF URLs", async () => {
    mocks.canvaExportDesign.mockResolvedValue([
      "https://download.canva.example/first.pdf",
      "https://download.canva.example/second.pdf",
    ]);

    const response = await POST(
      request({
        items: [
          {
            type: "canva",
            url: "https://www.canva.com/design/DESIGN123/share/view",
          },
        ],
      }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: "canva_pdf_export_multiple_urls",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
