import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  getClassroomCreatureRoster: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/creatures/classroom-roster", () => ({
  getClassroomCreatureRoster: mocks.getClassroomCreatureRoster,
}));

import { GET } from "./route";

describe("GET /api/student/creatures/classroom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({
      id: "student-1",
      classroomId: "classroom-1",
    });
    mocks.getClassroomCreatureRoster.mockResolvedValue({
      classroom: { id: "classroom-1", name: "햇살반" },
      students: [
        {
          studentId: "student-1",
          studentNumber: 1,
          number: 1,
          name: "홍길동",
          isCurrent: true,
          creature: null,
        },
      ],
    });
  });

  it("requires an authenticated student session", async () => {
    mocks.getCurrentStudent.mockRejectedValue(new Error("expired"));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.getClassroomCreatureRoster).not.toHaveBeenCalled();
  });

  it("scopes the roster to the authenticated student's classroom", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.getClassroomCreatureRoster).toHaveBeenCalledWith({
      id: "student-1",
      classroomId: "classroom-1",
    });
    await expect(response.json()).resolves.toMatchObject({
      classroom: { id: "classroom-1", name: "햇살반" },
      students: [{ studentId: "student-1", isCurrent: true }],
    });
  });

  it("returns a private no-store response", async () => {
    const response = await GET();

    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

