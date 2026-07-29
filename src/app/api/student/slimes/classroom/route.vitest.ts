import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: mocks.getCurrentStudent,
}));

vi.mock("@/lib/db", () => ({
  db: { student: { findMany: mocks.findMany } },
}));

import { GET } from "./route";

describe("GET /api/student/slimes/classroom", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an authenticated student", async () => {
    mocks.getCurrentStudent.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("returns the title equipped on the representative pet", async () => {
    mocks.getCurrentStudent.mockResolvedValue({
      id: "student-1",
      classroomId: "classroom-1",
    });
    mocks.findMany.mockResolvedValue([
      { id: "b", number: 12, name: "민수", slimes: [] },
      {
        id: "a",
        number: 2,
        name: "서연",
        slimes: [{
          color: "blue",
          growthStage: 2,
          equippedItemKeys: ["slime-ball-soccer-ball"],
          hiddenItemKeys: ["slime-ball-soccer-ball", "stale-item"],
          equippedTitleKey: "weekly-50k",
        }],
      },
      {
        id: "c",
        number: 5,
        name: "하린",
        slimes: [{
          color: "green",
          growthStage: 1,
          equippedItemKeys: [],
          hiddenItemKeys: [],
          equippedTitleKey: null,
        }],
      },
    ]);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { classroomId: "classroom-1" },
    }));
    expect(payload.students).toEqual([
      {
        id: "a",
        number: 2,
        name: "서연",
        walkingTitle: {
          key: "weekly-50k",
          label: "꾸준한 발걸음",
          imagePath: "/walking/titles/weekly-50k-pixel-512.png",
        },
        representative: {
          color: "blue",
          growthStage: 2,
          equippedItemKeys: ["slime-ball-soccer-ball"],
          hiddenItemKeys: ["slime-ball-soccer-ball"],
          equippedTitleKey: "weekly-50k",
        },
      },
      {
        id: "c",
        number: 5,
        name: "하린",
        walkingTitle: null,
        representative: {
          color: "green",
          growthStage: 1,
          equippedItemKeys: [],
          hiddenItemKeys: [],
          equippedTitleKey: null,
        },
      },
      {
        id: "b",
        number: 12,
        name: "민수",
        walkingTitle: null,
        representative: null,
      },
    ]);
  });
});
