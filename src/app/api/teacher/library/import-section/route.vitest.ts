import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findSection: vi.fn(),
  requirePermission: vi.fn(),
  importSection: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({ db: { section: { findUnique: mocks.findSection } } }));
vi.mock("@/lib/rbac", () => ({
  ForbiddenError: class ForbiddenError extends Error {},
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/teacher-library", () => ({
  TeacherLibraryError: class TeacherLibraryError extends Error {},
  importSectionIntoTeacherLibrary: mocks.importSection,
}));

import { POST } from "./route";

function request(sectionId = "section-1") {
  return new Request("http://localhost/api/teacher/library/import-section", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sectionId }),
  });
}

describe("teacher library section import route", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.findSection.mockReset();
    mocks.requirePermission.mockReset();
    mocks.importSection.mockReset();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.findSection.mockResolvedValue({ boardId: "board-1" });
    mocks.importSection.mockResolvedValue({ created: 2, reused: 1, failed: 0 });
  });

  it("requires edit permission and imports into the authenticated teacher library", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith("board-1", "teacher-1", "edit");
    expect(mocks.importSection).toHaveBeenCalledWith({
      userId: "teacher-1",
      sectionId: "section-1",
    });
    await expect(response.json()).resolves.toMatchObject({ created: 2, reused: 1 });
  });

  it("does not import a missing section", async () => {
    mocks.findSection.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.importSection).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("Unauthenticated"));
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.findSection).not.toHaveBeenCalled();
  });
});
