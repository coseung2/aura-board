import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  classroomFindMany: vi.fn(),
  boardMemberFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findMany: mocks.classroomFindMany },
    boardMember: { findMany: mocks.boardMemberFindMany },
  },
}));

import { GET } from "./route";

const officialKinds = [
  "kordle",
  "speed-game",
  "shadow-alliance",
  "omok",
  "song-guess",
];

describe("GET /api/nav/teacher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.classroomFindMany.mockResolvedValue([]);
    mocks.boardMemberFindMany.mockResolvedValue([]);
  });

  it("excludes official game rooms from classroom and recent-board navigation", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.classroomFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          boards: expect.objectContaining({
            where: { layout: { notIn: officialKinds } },
          }),
        }),
      }),
    );
    expect(mocks.boardMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "teacher-1",
          board: { layout: { notIn: officialKinds } },
        },
      }),
    );
    expect(await response.json()).toEqual({ classrooms: [], boards: [] });
  });
});
