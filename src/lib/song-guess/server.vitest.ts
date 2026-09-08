import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assetFindUnique: vi.fn(),
  songGuessGameFindUnique: vi.fn(),
  playSessionFindUnique: vi.fn(),
  studentFindMany: vi.fn(),
  resolveSongGuessActorForBoard: vi.fn(),
  loadSongGuessTeacherBoard: vi.fn(),
  resolveSongGuessParticipantSeeds: vi.fn(),
  playEngineFetch: vi.fn(),
  downloadPrivateObject: vi.fn(),
  uploadPrivateObject: vi.fn(),
  deletePrivateObject: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    songGuessAsset: { findUnique: mocks.assetFindUnique },
    songGuessGame: { findUnique: mocks.songGuessGameFindUnique },
    playSession: { findUnique: mocks.playSessionFindUnique },
    student: { findMany: mocks.studentFindMany },
  },
}));
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

import {
  buildSongGuessCreateRequest,
  enrichSongGuessPlayEngineResponse,
  loadSongGuessClipResponse,
} from "./server";

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

  it("enriches both a snapshot and a command response without changing scores", async () => {
    mocks.playSessionFindUnique.mockResolvedValue({
      boardId: "board-1",
      gameKind: "song-guess",
      board: { classroomId: "classroom-1" },
      participants: [
        { actorSubject: "student:student-1", studentId: null, slot: "player:0" },
      ],
    });
    mocks.studentFindMany.mockResolvedValue([{
      id: "student-1",
      slimes: [{
        color: "blue",
        growthStage: 1,
        equippedItemKeys: [],
        hiddenItemKeys: [],
        equippedTitleKey: null,
      }],
    }]);
    const current = snapshot(null);

    const direct = await enrichSongGuessPlayEngineResponse(
      new Response(JSON.stringify(current), { status: 200 }),
    );
    await expect(direct.json()).resolves.toMatchObject({
      participants: [{
        displayName: "Student",
        score: 0,
        participantId: "student-1",
        representativePet: {
          color: "blue",
          growthStage: 1,
        },
      }],
    });

    const command = await enrichSongGuessPlayEngineResponse(
      new Response(JSON.stringify({
        requestId: "request-1",
        previousVersion: 1,
        version: 2,
        snapshot: current,
        result: null,
      }), { status: 200 }),
    );
    await expect(command.json()).resolves.toMatchObject({
      snapshot: { participants: [{ participantId: "student-1" }] },
    });
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

  it("reports legacy video-only assets as missing private audio", async () => {
    mocks.assetFindUnique.mockResolvedValue({
      id: "asset-youtube",
      boardId: "board-1",
      objectKey: "song-guess/board-1/youtube/legacy",
      mimeType: "video/youtube",
      sizeBytes: 0,
      round: { id: "round-1", gameId: "game-1" },
    });
    await expect(loadSongGuessClipResponse("session-1", "asset-youtube")).rejects.toMatchObject({
      status: 409,
      code: "song_guess_audio_clip_missing",
    });
    expect(mocks.playEngineFetch).not.toHaveBeenCalled();
    expect(mocks.downloadPrivateObject).not.toHaveBeenCalled();
  });

  it("rejects a legacy video-only setup before starting a session", async () => {
    mocks.loadSongGuessTeacherBoard.mockResolvedValue({ actor: { userId: "teacher-1" } });
    mocks.songGuessGameFindUnique.mockResolvedValue({
      rounds: [{
        id: "round-1",
        order: 0,
        representativeAnswer: "Song",
        normalizedAnswer: "song",
        aliases: [],
        normalizedAliases: [],
        accessibilityClue: null,
        clips: [{ id: "asset-youtube", tierMs: 15_000, mimeType: "video/youtube", sizeBytes: 0, durationMs: 15_000 }],
      }],
    });
    await expect(buildSongGuessCreateRequest("board-1", "request-1")).rejects.toMatchObject({
      status: 409,
      code: "song_guess_audio_clip_missing",
    });
  });
});
