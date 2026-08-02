import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  classroomFindUnique: vi.fn(),
  boardMemberUpsert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    board: {
      findFirst: mocks.findFirst,
      create: mocks.create,
    },
    classroom: { findUnique: mocks.classroomFindUnique },
    boardMember: { upsert: mocks.boardMemberUpsert },
  },
}));

import { resolveOrCreateCanonicalGameRoom } from "./hub-room";

const existingRoom = {
  id: "room-1",
  slug: "game-hub-omok-abc",
  layout: "omok",
  classroomId: "classroom-1",
  systemGameKind: "omok",
};

describe("resolveOrCreateCanonicalGameRoom", () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
    mocks.create.mockReset();
    mocks.classroomFindUnique.mockReset().mockResolvedValue({
      teacherId: "teacher-1",
    });
    mocks.boardMemberUpsert.mockReset().mockResolvedValue({ id: "member-1" });
  });

  it("returns the stable server-owned room without creating a teacher board", async () => {
    mocks.findFirst.mockResolvedValue(existingRoom);

    await expect(
      resolveOrCreateCanonicalGameRoom(
        { id: "student-1", classroomId: "classroom-1" },
        "omok",
      ),
    ).resolves.toEqual(existingRoom);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { classroomId: "classroom-1", systemGameKind: "omok" },
      select: expect.any(Object),
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.boardMemberUpsert).toHaveBeenCalledWith({
      where: {
        boardId_userId: { boardId: "room-1", userId: "teacher-1" },
      },
      update: { role: "owner" },
      create: { boardId: "room-1", userId: "teacher-1", role: "owner" },
    });
  });

  it("creates one classroom-scoped room from authenticated identity only", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockImplementation(async ({ data }) => ({
      id: "room-created",
      slug: data.slug,
      layout: data.layout,
      classroomId: data.classroomId,
      systemGameKind: data.systemGameKind,
    }));

    const room = await resolveOrCreateCanonicalGameRoom(
      { id: "student-1", classroomId: "classroom-1" },
      "song-guess",
    );

    expect(room).toMatchObject({
      id: "room-created",
      layout: "song-guess",
      classroomId: "classroom-1",
      systemGameKind: "song-guess",
    });
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "노래 맞히기",
        layout: "song-guess",
        category: "PLAY",
        classroomId: "classroom-1",
        systemGameKind: "song-guess",
        thumbnailMode: "none",
        members: {
          create: { userId: "teacher-1", role: "owner" },
        },
      }),
      select: expect.any(Object),
    });
    const data = mocks.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty("studentId");
    expect(data).not.toHaveProperty("teacherId");
    expect(data).not.toHaveProperty("score");
    expect(data).not.toHaveProperty("durationMs");
  });

  it("converges on the same room when first entry races", async () => {
    mocks.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingRoom);
    mocks.create.mockRejectedValue({ code: "P2002" });

    await expect(
      resolveOrCreateCanonicalGameRoom(
        { id: "student-2", classroomId: "classroom-1" },
        "omok",
      ),
    ).resolves.toEqual(existingRoom);
    expect(mocks.findFirst).toHaveBeenCalledTimes(2);
  });
});
