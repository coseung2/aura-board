import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  deleteMany: vi.fn(),
  deletePrivateObject: vi.fn(),
  loadSongGuessTeacherBoard: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        songGuessAsset: {
          findFirst: mocks.findFirst,
          deleteMany: mocks.deleteMany,
        },
      }),
    ),
    songGuessAsset: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/media-storage", () => ({
  downloadPrivateObject: vi.fn(),
  uploadPrivateObject: vi.fn(),
  deletePrivateObject: mocks.deletePrivateObject,
}));
vi.mock("@/lib/play-platform/server-client", () => ({ playEngineFetch: vi.fn() }));
vi.mock("@/lib/play-platform/actor", () => ({
  PlayAccessError: class PlayAccessError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
  loadSongGuessTeacherBoard: mocks.loadSongGuessTeacherBoard,
  resolveSongGuessActorForBoard: vi.fn(),
  resolveSongGuessParticipantSeeds: vi.fn(),
}));

import { deleteUploadedSongGuessClip } from "./server";

describe("song-guess unassigned derivative cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadSongGuessTeacherBoard.mockResolvedValue({ actor: { userId: "teacher-1" } });
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    mocks.deletePrivateObject.mockResolvedValue(undefined);
  });

  it("deletes only an unassigned opaque asset owned by the board", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "asset-500",
      roundId: null,
      objectKey: "song-guess/board-1/private/500.wav",
    });

    await expect(deleteUploadedSongGuessClip("board-1", "asset-500")).resolves.toBe(true);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "asset-500", boardId: "board-1" },
      select: { id: true, roundId: true, objectKey: true },
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: "asset-500", boardId: "board-1", roundId: null },
    });
    expect(mocks.deletePrivateObject).toHaveBeenCalledWith(
      "song-guess/board-1/private/500.wav",
    );
  });

  it("refuses to delete a derivative already assigned to a saved round", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "asset-500",
      roundId: "round-1",
      objectKey: "song-guess/board-1/private/500.wav",
    });

    await expect(deleteUploadedSongGuessClip("board-1", "asset-500")).rejects.toMatchObject({
      status: 409,
      code: "song_guess_clip_assigned",
    });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.deletePrivateObject).not.toHaveBeenCalled();
  });
});
