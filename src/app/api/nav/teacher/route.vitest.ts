import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  classroomFindMany: vi.fn(),
  boardMemberFindMany: vi.fn(),
  boardFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findMany: mocks.classroomFindMany },
    boardMember: { findMany: mocks.boardMemberFindMany },
    board: { findMany: mocks.boardFindMany },
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
    mocks.boardFindMany.mockResolvedValue([]);
  });

  it("keeps lesson boards excluding official rooms while listing the five play-hub games", async () => {
    mocks.classroomFindMany.mockResolvedValue([
      {
        id: "class-1",
        name: "별무리반",
        boards: [
          {
            id: "lesson-1",
            slug: "lesson-1",
            title: "국어, 수학",
            category: "LESSON",
            classroomId: "class-1",
            updatedAt: new Date("2026-08-01T00:00:00.000Z"),
            layout: "columns",
            systemGameKind: null,
          },
        ],
      },
    ]);
    mocks.boardFindMany.mockResolvedValue([
      {
        id: "room-omok",
        slug: "game-hub-omok-class",
        layout: "omok",
        classroomId: "class-1",
        systemGameKind: "omok",
      },
    ]);

    const response = await GET();
    const body = await response.json();

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
    expect(mocks.boardFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          classroomId: { in: ["class-1"] },
          systemGameKind: { in: officialKinds },
        },
      }),
    );

    const classroom = body.classrooms[0];
    expect(classroom.boards.map((board: { title: string }) => board.title)).toEqual([
      "국어, 수학",
      "그림자연합",
      "꼬들",
      "스피드게임",
      "오목",
      "노래 맞히기",
    ]);
    expect(
      classroom.boards.find((board: { title: string }) => board.title === "오목"),
    ).toMatchObject({
      id: "room-omok",
      slug: "game-hub-omok-class",
      category: "PLAY",
    });
    expect(
      classroom.boards.find((board: { title: string }) => board.title === "오목")
        .pending,
    ).toBeUndefined();
    expect(
      classroom.boards.find((board: { title: string }) => board.title === "그림자연합"),
    ).toMatchObject({
      category: "PLAY",
      pending: true,
      systemGameKind: "shadow-alliance",
    });
  });
});
