import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  classroomFind: vi.fn(),
  layoutFindMany: vi.fn(),
  layoutCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findUnique: mocks.classroomFind },
    classroomSeatingLayout: {
      findMany: mocks.layoutFindMany,
      create: mocks.layoutCreate,
    },
  },
}));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ id: "classroom-1" }) };

describe("owner-only seating layout API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.com",
    });
  });

  it.each(["GET", "POST"])(
    "allows %s from the ordinary classroom owner",
    async (method) => {
      mocks.classroomFind.mockResolvedValueOnce({ id: "classroom-1", teacherId: "teacher-1" });
      mocks.layoutFindMany.mockResolvedValueOnce([]);
      mocks.layoutCreate.mockResolvedValueOnce({ id: "layout-1" });
      const request = new Request(
        "http://localhost/api/classroom/classroom-1/seating-layouts",
        {
          method,
          headers: { "content-type": "application/json" },
          ...(method === "POST"
            ? {
                body: JSON.stringify({
                  name: "배치",
                  groups: [{ name: "1분단", studentIds: ["s1"] }],
                }),
              }
            : {}),
        },
      );
      const response =
        method === "GET"
          ? await GET(request, context)
          : await POST(request, context);

      expect(response.status).toBe(method === "GET" ? 200 : 201);
      expect(mocks.classroomFind).toHaveBeenCalled();
    },
  );

  it("allows the administrator to read saved layouts for an owned classroom", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      id: "admin-1",
      email: "mallagaenge@gmail.com",
    });
    mocks.classroomFind.mockResolvedValueOnce({
      id: "classroom-1",
      teacherId: "admin-1",
    });
    mocks.layoutFindMany.mockResolvedValueOnce([]);

    const response = await GET(
      new Request("http://localhost/api/classroom/classroom-1/seating-layouts"),
      context,
    );
    expect(response.status).toBe(200);
  });

  it("returns a conflict instead of silently replacing a same-named layout", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      id: "admin-1",
      email: "mallagaenge@gmail.com",
    });
    mocks.classroomFind.mockResolvedValueOnce({
      id: "classroom-1",
      teacherId: "admin-1",
    });
    mocks.layoutCreate.mockRejectedValueOnce({ code: "P2002" });

    const response = await POST(
      new Request(
        "http://localhost/api/classroom/classroom-1/seating-layouts",
        {
          method: "POST",
          body: JSON.stringify({
            name: "배치",
            groups: [{ name: "1분단", studentIds: ["s1"] }],
          }),
        },
      ),
      context,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "name_conflict" });
  });
});
