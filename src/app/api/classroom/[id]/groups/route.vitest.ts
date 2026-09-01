import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  classroomFind: vi.fn(),
  studentFindMany: vi.fn(),
  loadGroups: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findUnique: mocks.classroomFind },
    student: { findMany: mocks.studentFindMany },
  },
}));
vi.mock("@/lib/default-groups", () => ({
  loadClassroomDefaultGroups: mocks.loadGroups,
  saveClassroomDefaultGroups: vi.fn(),
}));

import { GET, PUT } from "./route";

const context = { params: Promise.resolve({ id: "classroom-1" }) };

describe("admin-only classroom groups API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1", email: "teacher@example.com" });
  });

  it.each(["GET", "PUT"])("hides %s from a non-admin teacher", async (method) => {
    const request = new Request("http://localhost/api/classroom/classroom-1/groups", {
      method,
      headers: { "content-type": "application/json" },
      ...(method === "PUT" ? { body: JSON.stringify({ groups: [] }) } : {}),
    });
    const response = method === "GET"
      ? await GET(request, context)
      : await PUT(request, context);

    expect(response.status).toBe(404);
    expect(mocks.classroomFind).not.toHaveBeenCalled();
  });

  it("allows the administrator to read an owned classroom", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      id: "admin-1",
      email: "mallagaenge@gmail.com",
    });
    mocks.classroomFind.mockResolvedValueOnce({ id: "classroom-1", teacherId: "admin-1" });
    mocks.studentFindMany.mockResolvedValueOnce([]);
    mocks.loadGroups.mockResolvedValueOnce([]);

    const response = await GET(
      new Request("http://localhost/api/classroom/classroom-1/groups"),
      context,
    );
    expect(response.status).toBe(200);
  });
});
