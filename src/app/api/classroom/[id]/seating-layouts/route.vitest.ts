import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  classroomFind: vi.fn(),
  layoutFindMany: vi.fn(),
  layoutUpsert: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findUnique: mocks.classroomFind },
    classroomSeatingLayout: {
      findMany: mocks.layoutFindMany,
      upsert: mocks.layoutUpsert,
    },
  },
}));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ id: "classroom-1" }) };

describe("admin-only seating layout API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1", email: "teacher@example.com" });
  });

  it.each(["GET", "POST"])("hides %s from a non-admin teacher", async (method) => {
    const request = new Request("http://localhost/api/classroom/classroom-1/seating-layouts", {
      method,
      headers: { "content-type": "application/json" },
      ...(method === "POST"
        ? { body: JSON.stringify({ name: "배치", groups: [{ name: "1분단", studentIds: ["s1"] }] }) }
        : {}),
    });
    const response = method === "GET"
      ? await GET(request, context)
      : await POST(request, context);

    expect(response.status).toBe(404);
    expect(mocks.classroomFind).not.toHaveBeenCalled();
  });

  it("allows the administrator to read saved layouts for an owned classroom", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      id: "admin-1",
      email: "mallagaenge@gmail.com",
    });
    mocks.classroomFind.mockResolvedValueOnce({ id: "classroom-1", teacherId: "admin-1" });
    mocks.layoutFindMany.mockResolvedValueOnce([]);

    const response = await GET(
      new Request("http://localhost/api/classroom/classroom-1/seating-layouts"),
      context,
    );
    expect(response.status).toBe(200);
  });
});
