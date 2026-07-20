import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  equipSlime: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/pets/service", () => ({
  equipSlime: mocks.equipSlime,
  isSlimeServiceError: (error: unknown) => Boolean(error && typeof error === "object" && "code" in error),
}));

import { POST } from "./route";

const request = (body: unknown) =>
  new Request("http://localhost/api/student/slimes/equip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/student/slimes/equip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.equipSlime.mockResolvedValue({
      slimeColor: "blue",
      isEquipped: false,
      equippedColors: [],
      growthSpeedBps: 0,
      growthByColor: {},
      growth: {},
      effects: { totals: { growth_speed: 0 } },
    });
  });

  it("requires authentication and validates the toggle body", async () => {
    mocks.getCurrentStudent.mockResolvedValue(null);
    expect((await POST(request({ color: "blue", isEquipped: false }))).status).toBe(401);

    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    expect((await POST(request({ color: "blue" }))).status).toBe(400);
    expect(mocks.equipSlime).not.toHaveBeenCalled();
  });

  it("passes the authenticated student and returns the full recalculated payload", async () => {
    const response = await POST(request({ color: "blue", isEquipped: false }));
    expect(response.status).toBe(200);
    expect(mocks.equipSlime).toHaveBeenCalledWith(
      { id: "student-1", classroomId: "classroom-1" },
      "blue",
      false,
    );
    expect(await response.json()).toMatchObject({
      slimeColor: "blue",
      isEquipped: false,
      growthSpeedBps: 0,
      growthByColor: {},
    });
  });
});
