import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  getSlimeHome: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/pets/service", () => ({
  getSlimeHome: mocks.getSlimeHome,
  isSlimeServiceError: () => false,
}));

import { GET } from "./route";

describe("GET /api/student/slimes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.getSlimeHome.mockResolvedValue({
      balance: 200,
      currency: { unitLabel: "원" },
      ownedColors: ["blue"],
      catalog: [],
    });
  });

  it("requires student auth", async () => {
    mocks.getCurrentStudent.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it("returns the authenticated student's private wallet snapshot", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(mocks.getSlimeHome).toHaveBeenCalledWith({ id: "student-1", classroomId: "classroom-1" });
    expect(await response.json()).toMatchObject({ balance: 200, ownedColors: ["blue"] });
  });
});
