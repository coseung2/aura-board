import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(async () => ({
    id: "teacher-1",
    email: "teacher@example.com",
  })),
  classroomFind: vi.fn(),
  layoutFindFirst: vi.fn(),
  updateLayout: vi.fn(),
  deleteLayouts: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findUnique: mocks.classroomFind },
    classroomSeatingLayout: {
      findFirst: mocks.layoutFindFirst,
      update: mocks.updateLayout,
      deleteMany: mocks.deleteLayouts,
    },
  },
}));

import { DELETE, PATCH } from "./route";

describe("owner-only seating layout mutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.com",
    });
  });

  it.each(["PATCH", "DELETE"])("allows an ordinary owner to %s an owned layout", async method => {
    mocks.classroomFind.mockResolvedValueOnce({ teacherId: "teacher-1" });
    mocks.layoutFindFirst.mockResolvedValueOnce({ id: "layout-1" });
    mocks.updateLayout.mockResolvedValueOnce({ id: "layout-1", name: "새 이름" });
    mocks.deleteLayouts.mockResolvedValueOnce({ count: 1 });
    const response = await (method === "PATCH" ? PATCH : DELETE)(
      new Request("http://localhost/api/classroom/classroom-1/seating-layouts/layout-1", { method, ...(method === "PATCH" ? { body: JSON.stringify({ name: "새 이름" }) } : {}) }),
      { params: Promise.resolve({ id: "classroom-1", layoutId: "layout-1" }) },
    );
    expect(response.status).toBe(200);
  });

  it("hides deletion for a classroom the teacher does not own", async () => {
    const response = await DELETE(
      new Request(
        "http://localhost/api/classroom/classroom-1/seating-layouts/layout-1",
        {
          method: "DELETE",
        },
      ),
      { params: Promise.resolve({ id: "classroom-1", layoutId: "layout-1" }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.classroomFind).toHaveBeenCalled();
    expect(mocks.deleteLayouts).not.toHaveBeenCalled();
  });

  it("hides renaming for a classroom the teacher does not own", async () => {
    const response = await PATCH(
      new Request(
        "http://localhost/api/classroom/classroom-1/seating-layouts/layout-1",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "새 이름" }),
        },
      ),
      { params: Promise.resolve({ id: "classroom-1", layoutId: "layout-1" }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.classroomFind).toHaveBeenCalled();
    expect(mocks.layoutFindFirst).not.toHaveBeenCalled();
  });

  it("hides renaming for a layout outside the owned classroom", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      id: "admin-1",
      email: "mallagaenge@gmail.com",
    });
    mocks.classroomFind.mockResolvedValueOnce({ teacherId: "admin-1" });
    mocks.layoutFindFirst.mockResolvedValueOnce(null);

    const response = await PATCH(
      new Request(
        "http://localhost/api/classroom/classroom-1/seating-layouts/foreign-layout",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "새 이름" }),
        },
      ),
      {
        params: Promise.resolve({
          id: "classroom-1",
          layoutId: "foreign-layout",
        }),
      },
    );

    expect(response.status).toBe(404);
    expect(mocks.updateLayout).not.toHaveBeenCalled();
  });

  it("returns a conflict instead of replacing another layout on rename", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      id: "admin-1",
      email: "mallagaenge@gmail.com",
    });
    mocks.classroomFind.mockResolvedValueOnce({ teacherId: "admin-1" });
    mocks.layoutFindFirst.mockResolvedValueOnce({ id: "layout-1" });
    mocks.updateLayout.mockRejectedValueOnce({ code: "P2002" });

    const response = await PATCH(
      new Request(
        "http://localhost/api/classroom/classroom-1/seating-layouts/layout-1",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "다른 배치" }),
        },
      ),
      { params: Promise.resolve({ id: "classroom-1", layoutId: "layout-1" }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "name_conflict" });
  });
});
