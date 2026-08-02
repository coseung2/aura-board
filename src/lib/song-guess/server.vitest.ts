import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assetFindUnique: vi.fn(),
  resolveSongGuessActorForBoard: vi.fn(),
  loadSongGuessTeacherBoard: vi.fn(),
  resolveSongGuessParticipantSeeds: vi.fn(),
  playEngineFetch: vi.fn(),
  downloadPrivateObject: vi.fn(),
  uploadPrivateObject: vi.fn(),
  deletePrivateObject: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { songGuessAsset: { findUnique: mocks.assetFindUnique } } }));
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
  resolveSongGuessActorForBoard: mocks.resolveSongGuessActorForBoard,
  loadSongGuessTeacherBoard: mocks.loadSongGuessTeacherBoard,
  resolveSongGuessParticipantSeeds: mocks.resolveSongGuessParticipantSeeds,
}));
vi.mock("@/lib/play-platform/server-client", () => ({ playEngineFetch: mocks.playEngineFetch }));
vi.mock("@/lib/media-storage", () => ({
  downloadPrivateObject: mocks.downloadPrivateObject,
  uploadPrivateObject: mocks.uploadPrivateObject,
  deletePrivateObject: mocks.deletePrivateObject,
}));

import { loadSongGuessClipResponse } from "./server";

function snapshot(assetId: string | null, phase: "guessing" | "reveal" = "guessing") {
  return {
    sessionId: "session-1",
    boardId: "board-1",
    gameKind: "song-guess",
    version: 2,
    serverTimeMs: 1_000,
    rulesVersion: 1,
    stateSchemaVersion: 1,
    previousSessionId: null,
    phase,
    currentRound: {
      roundId: "round-1",
      order: 0,
      accessibilityClue: null,
      revealedAnswer: phase === "reveal" ? "Blue Moon" : null,
      currentClip: assetId
        ? { assetId, tierMs: 500, mimeType: "audio/webm", durationMs: 500, sizeBytes: 3 }
        : null,
    },
    participants: [{ displayName: "Student", score: 0, scoredCurrentRound: false }],
    viewer: { role: "participant", scoredCurrentRound: false },
  };
}

describe("song-guess gated clip retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assetFindUnique.mockResolvedValue({
      id: "asset-500",
      boardId: "board-1",
      objectKey: "song-guess/board-1/private-key",
      mimeType: "audio/webm",
      sizeBytes: 3,
      round: { id: "round-1", gameId: "game-1" },
    });
    mocks.resolveSongGuessActorForBoard.mockResolvedValue({
      actor: { subject: "student:1", role: "participant", userId: null, studentId: "1" },
    });
    mocks.playEngineFetch.mockResolvedValue(
      new Response(JSON.stringify(snapshot("asset-500")), { status: 200 }),
    );
    mocks.downloadPrivateObject.mockResolvedValue({ body: Buffer.from("abc") });
  });

  it("serves only the current unlocked clip through an authenticated response", async () => {
    const response = await loadSongGuessClipResponse("session-1", "asset-500");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("content-type")).toBe("audio/webm");
    expect(await response.text()).toBe("abc");
    expect(mocks.downloadPrivateObject).toHaveBeenCalledWith("song-guess/board-1/private-key");
  });

  it("rejects a locked or future clip before reading private storage", async () => {
    mocks.playEngineFetch.mockResolvedValue(
      new Response(JSON.stringify(snapshot("asset-1000")), { status: 200 }),
    );
    await expect(loadSongGuessClipResponse("session-1", "asset-500")).rejects.toMatchObject({
      status: 403,
      code: "song_guess_clip_locked",
    });
    expect(mocks.downloadPrivateObject).not.toHaveBeenCalled();
  });

  it("does not gate access on a public URL or expose the object key", async () => {
    const response = await loadSongGuessClipResponse("session-1", "asset-500");
    const text = await response.text();
    expect(text).not.toContain("song-guess/board-1/private-key");
    expect(text).not.toContain("http");
  });
});
