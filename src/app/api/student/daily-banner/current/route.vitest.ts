import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  getDailyBanner: vi.fn(),
  getKstDay: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: mocks.getCurrentStudent,
}));

vi.mock("@/lib/daily-banner", () => ({
  getDailyBanner: mocks.getDailyBanner,
  getKstDay: mocks.getKstDay,
}));

import { GET } from "./route";

describe("GET /api/student/daily-banner/current", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getKstDay.mockReturnValue("2026-07-15");
    mocks.getCurrentStudent.mockResolvedValue({
      id: "student-1",
      classroomId: "classroom-1",
    });
    mocks.getDailyBanner.mockResolvedValue({ id: "banner-1" });
  });

  it("loads only the current student's classroom banner", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.getDailyBanner).toHaveBeenCalledWith(
      "classroom-1",
      "2026-07-15",
    );
    expect(await response.json()).toEqual({
      day: "2026-07-15",
      banner: { id: "banner-1" },
    });
  });
});
