import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  buildPdf: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "teacher-1" })),
}));
vi.mock("@/lib/db", () => ({
  db: { teacherLibraryItem: { findMany: mocks.findMany } },
}));
vi.mock("@/lib/rate-limit-routes", () => ({
  limitCanvaExport: vi.fn(async () => ({ ok: true, retryAfter: 0 })),
}));
vi.mock("@/lib/teacher-library-pdf", () => ({
  TeacherLibraryPdfError: class TeacherLibraryPdfError extends Error {},
  buildTeacherLibraryPdf: mocks.buildPdf,
}));

import { POST } from "./route";

function request(itemIds: string[]) {
  return new Request("http://localhost/api/teacher/library/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ itemIds, filename: "우리 반 자료" }),
  });
}

describe("teacher library PDF export route", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
    mocks.buildPdf.mockReset();
    mocks.buildPdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  });

  it("preserves the client-selected item order", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "image-1", kind: "image", assetUrl: "/uploads/a.png", canvaDesignId: null },
      { id: "canva-1", kind: "canva", assetUrl: null, canvaDesignId: "D123" },
    ]);
    const response = await POST(request(["canva-1", "image-1"]));
    expect(response.status).toBe(200);
    expect(mocks.buildPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "teacher-1",
        items: [
          expect.objectContaining({ id: "canva-1" }),
          expect.objectContaining({ id: "image-1" }),
        ],
      }),
    );
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });

  it("fails atomically when any requested item is not owned", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "image-1", kind: "image", assetUrl: "/uploads/a.png", canvaDesignId: null },
    ]);
    const response = await POST(request(["image-1", "someone-elses-item"]));
    expect(response.status).toBe(404);
    expect(mocks.buildPdf).not.toHaveBeenCalled();
  });

  it("rejects duplicate item IDs", async () => {
    const response = await POST(request(["image-1", "image-1"]));
    expect(response.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
