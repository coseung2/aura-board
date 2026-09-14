import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/canva", () => ({
  canvaExportDesign: vi.fn(),
  getAccessToken: vi.fn(async () => null),
}));

import {
  buildTeacherLibraryPdf,
  inspectTeacherLibraryPrintSources,
} from "./teacher-library-pdf";
import { DEFAULT_TEACHER_LIBRARY_PRINT_OPTIONS } from "./teacher-library-print-layout";

let imageBytes: Buffer;

beforeAll(async () => {
  imageBytes = await sharp({
    create: {
      width: 120,
      height: 80,
      channels: 4,
      background: { r: 92, g: 82, b: 214, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(imageBytes, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    ),
  );
});

describe("buildTeacherLibraryPdf layouts", () => {
  const items = ["a", "b"].map((id) => ({
    kind: "image",
    assetUrl: `/uploads/${id}.png`,
    canvaDesignId: null,
  }));

  it("places multiple images together for A4 auto layout", async () => {
    const bytes = await buildTeacherLibraryPdf({
      userId: "teacher-1",
      items,
      baseUrl: "http://localhost/api/teacher/library/export",
      options: DEFAULT_TEACHER_LIBRARY_PRINT_OPTIONS,
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("keeps one image per page for A4 fit layout", async () => {
    const bytes = await buildTeacherLibraryPdf({
      userId: "teacher-1",
      items,
      baseUrl: "http://localhost/api/teacher/library/export",
      options: { ...DEFAULT_TEACHER_LIBRARY_PRINT_OPTIONS, mode: "fit-page" },
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it("reads image density for an exact print source size", async () => {
    const sources = await inspectTeacherLibraryPrintSources({
      userId: "teacher-1",
      items: [items[0]],
      baseUrl: "http://localhost/api/teacher/library/print-sources",
    });

    expect(sources).toHaveLength(1);
    expect(sources[0].width).toBeCloseTo(90);
    expect(sources[0].height).toBeCloseTo(60);
  });

});
