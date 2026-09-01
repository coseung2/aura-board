import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(async () => ({ id: "teacher-1", email: "teacher@example.com" })),
  classroomFind: vi.fn(),
  deleteLayouts: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findUnique: mocks.classroomFind },
    classroomSeatingLayout: { deleteMany: mocks.deleteLayouts },
  },
}));

import { DELETE } from "./route";

describe("admin-only seating layout deletion", () => {
  it("hides the endpoint from a non-admin teacher", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/classroom/classroom-1/seating-layouts/layout-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "classroom-1", layoutId: "layout-1" }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.classroomFind).not.toHaveBeenCalled();
    expect(mocks.deleteLayouts).not.toHaveBeenCalled();
  });
});
