import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  classroomFindUnique: vi.fn(),
  boardMemberUpsert: vi.fn(),
  transaction: vi.fn(),
  studentFindMany: vi.fn(),
  groupFindMany: vi.fn(),
  groupDeleteMany: vi.fn(),
  groupCreate: vi.fn(),
  groupMemberDeleteMany: vi.fn(),
  groupMemberCreateMany: vi.fn(),
  gameFindUnique: vi.fn(),
  gameCreate: vi.fn(),
  gameUpdate: vi.fn(),
  roundUpsert: vi.fn(),
  roundFindMany: vi.fn(),
  roundUpdate: vi.fn(),
  runFindFirst: vi.fn(),
  createSpeedGameRun: vi.fn(),
  kordleGameUpsert: vi.fn(),
}));

vi.mock("@/lib/speed-game/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/speed-game/runtime")>()),
  createSpeedGameRun: mocks.createSpeedGameRun,
}));

vi.mock("@/lib/db", () => ({
  db: {
    board: {
      findFirst: mocks.findFirst,
      create: mocks.create,
    },
    classroom: { findUnique: mocks.classroomFindUnique },
    boardMember: { upsert: mocks.boardMemberUpsert },
    $transaction: mocks.transaction,
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
  it("does not provision a teacher-only game on student entry", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(resolveOrCreateCanonicalGameRoom({ classroomId: "classroom-1" }, "speed-game", { allowCreate: false }))
      .rejects.toThrow("teacher_room_not_open");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    mocks.findFirst.mockReset();
    mocks.create.mockReset();
    mocks.classroomFindUnique.mockReset().mockResolvedValue({
      teacherId: "teacher-1",
    });
    mocks.boardMemberUpsert.mockReset().mockResolvedValue({ id: "member-1" });
    mocks.transaction.mockReset().mockImplementation(async (operation) =>
      operation({
        board: { create: mocks.create },
        student: { findMany: mocks.studentFindMany },
        boardDefaultGroup: {
          findMany: mocks.groupFindMany,
          deleteMany: mocks.groupDeleteMany,
          create: mocks.groupCreate,
        },
        boardDefaultGroupMember: {
          deleteMany: mocks.groupMemberDeleteMany,
          createMany: mocks.groupMemberCreateMany,
        },
        speedGame: {
          findUnique: mocks.gameFindUnique,
          create: mocks.gameCreate,
          update: mocks.gameUpdate,
        },
        speedGameRound: {
          upsert: mocks.roundUpsert,
          findMany: mocks.roundFindMany,
          update: mocks.roundUpdate,
        },
        speedGameRun: { findFirst: mocks.runFindFirst },
        kordleGame: { upsert: mocks.kordleGameUpsert },
      }),
    );
    mocks.studentFindMany.mockReset().mockResolvedValue([
      { id: "student-1" },
      { id: "student-2" },
    ]);
    mocks.groupFindMany.mockReset().mockResolvedValue([]);
    mocks.groupDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    mocks.groupMemberDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    mocks.groupCreate.mockReset().mockResolvedValue({ id: "group-1" });
    mocks.groupMemberCreateMany.mockReset().mockResolvedValue({ count: 2 });
    mocks.gameFindUnique.mockReset().mockResolvedValue(null);
    mocks.gameCreate.mockReset().mockResolvedValue({ id: "game-1" });
    mocks.gameUpdate.mockReset();
    mocks.roundUpsert.mockReset().mockResolvedValue({ id: "round" });
    mocks.roundFindMany.mockReset().mockResolvedValue([
      { id: "round-1", order: 0, guesserSlot: 1 },
      { id: "round-2", order: 1, guesserSlot: 2 },
    ]);
    mocks.roundUpdate.mockReset();
    mocks.runFindFirst.mockReset().mockResolvedValue(null);
    mocks.createSpeedGameRun.mockReset().mockResolvedValue("run-1");
    mocks.kordleGameUpsert.mockReset().mockResolvedValue({ id: "kordle-game-1" });
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

  it("creates a complete canonical speed-game with a valid two-student rotation", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockImplementation(async ({ data }) => ({
      id: "speed-room",
      slug: data.slug,
      layout: data.layout,
      classroomId: data.classroomId,
      systemGameKind: data.systemGameKind,
    }));

    await resolveOrCreateCanonicalGameRoom(
      { id: "teacher-1", classroomId: "classroom-1" },
      "speed-game",
    );

    expect(mocks.gameCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ boardId: "speed-room", timeLimitMs: 30_000 }),
      select: { id: true },
    });
    expect(mocks.roundUpsert.mock.calls.map(([call]) => call.create.guesserSlot)).toEqual([
      1,
      2,
    ]);
    expect(mocks.groupMemberCreateMany).toHaveBeenCalledWith({
      data: [
        { boardId: "speed-room", groupId: "group-1", studentId: "student-1", order: 0 },
        { boardId: "speed-room", groupId: "group-1", studentId: "student-2", order: 1 },
      ],
    });
    expect(mocks.createSpeedGameRun).toHaveBeenCalledWith(
      expect.any(Object),
      { gameId: "game-1", previousRunId: null },
    );
  });

  it("creates the Kordle engine with the canonical six-letter live-class settings", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockImplementation(async ({ data }) => ({
      id: "kordle-room",
      slug: data.slug,
      layout: data.layout,
      classroomId: data.classroomId,
      systemGameKind: data.systemGameKind,
    }));

    await resolveOrCreateCanonicalGameRoom(
      { id: "teacher-1", classroomId: "classroom-1" },
      "kordle",
    );

    expect(mocks.kordleGameUpsert).toHaveBeenCalledWith({
      where: { boardId: "kordle-room" },
      update: {
        title: "꼬들",
        locale: "ko-KR",
        wordLength: 6,
        maxGuesses: 6,
        mode: "LIVE_CLASS",
      },
      create: {
        boardId: "kordle-room",
        title: "꼬들",
        locale: "ko-KR",
        wordLength: 6,
        maxGuesses: 6,
        mode: "LIVE_CLASS",
      },
    });
  });

  it("repairs a canonical Kordle room that is missing its engine row", async () => {
    const kordleRoom = {
      id: "kordle-room",
      slug: "game-hub-kordle-abc",
      layout: "kordle",
      classroomId: "classroom-1",
      systemGameKind: "kordle",
    };
    mocks.findFirst.mockResolvedValue(kordleRoom);

    await expect(
      resolveOrCreateCanonicalGameRoom(
        { id: "teacher-1", classroomId: "classroom-1" },
        "kordle",
      ),
    ).resolves.toEqual(kordleRoom);

    expect(mocks.kordleGameUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { boardId: "kordle-room" } }),
    );
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
