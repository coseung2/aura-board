import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadSongGuessTeacherBoard: vi.fn(),
  storeSongGuessClip: vi.fn(),
}));

vi.mock("@/lib/song-guess/server", () => ({
  storeSongGuessClip: mocks.storeSongGuessClip,
}));
vi.mock("@/lib/play-platform/actor", () => ({
  loadSongGuessTeacherBoard: mocks.loadSongGuessTeacherBoard,
  PlayAccessError: class PlayAccessError extends Error {
    status = 403;
    code = "forbidden";
  },
}));

import { POST } from "./route";

function request(fields: Record<string, string>, file = {
  arrayBuffer: async () => new Uint8Array(100).buffer,
  type: "audio/webm",
  size: 100,
}) {
  const values = new Map<string, unknown>([["file", file]]);
  for (const [key, value] of Object.entries(fields)) values.set(key, value);
  return {
    headers: new Headers(),
    formData: vi.fn(async () => ({ get: (key: string) => values.get(key) ?? null })),
  } as unknown as Request;
}

describe("POST /api/song-guess/boards/:boardId/clips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadSongGuessTeacherBoard.mockResolvedValue({ actor: { userId: "teacher-1" } });
    mocks.storeSongGuessClip.mockResolvedValue({
      id: "asset-500",
      tierMs: 500,
      mimeType: "audio/webm",
      sizeBytes: 100,
      durationMs: 500,
    });
  });

  it("rejects original/source uploads before storage", async () => {
    const response = await POST(
      request({ assetKind: "source", tierMs: "500", durationMs: "500" }),
      { params: Promise.resolve({ boardId: "board-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "source_audio_not_allowed" });
    expect(mocks.storeSongGuessClip).not.toHaveBeenCalled();
  });

  it("rejects non-fixed derivative metadata", async () => {
    const response = await POST(
      request({ tierMs: "500", durationMs: "900" }),
      { params: Promise.resolve({ boardId: "board-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_clip_duration" });
    expect(mocks.storeSongGuessClip).not.toHaveBeenCalled();
  });

  it("rejects oversized multipart requests before buffering the form", async () => {
    const oversized = request({ tierMs: "500", durationMs: "500" });
    (oversized as unknown as { headers: Headers }).headers = new Headers({
      "content-length": String(8 * 1024 * 1024 + 64 * 1024 + 1),
    });
    const response = await POST(oversized, {
      params: Promise.resolve({ boardId: "board-1" }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "clip_too_large" });
    expect(mocks.storeSongGuessClip).not.toHaveBeenCalled();
  });

  it("accepts a deterministic browser PCM WAV derivative", async () => {
    const wavFile = {
      arrayBuffer: async () => new Uint8Array(100).buffer,
      type: "audio/wav",
      size: 100,
    };
    mocks.storeSongGuessClip.mockResolvedValue({
      id: "asset-wav-500",
      tierMs: 500,
      mimeType: "audio/wav",
      sizeBytes: 100,
      durationMs: 500,
    });
    const response = await POST(
      request(
        { assetKind: "clip", tierMs: "500", durationMs: "500" },
        wavFile,
      ),
      { params: Promise.resolve({ boardId: "board-1" }) },
    );
    expect(response.status).toBe(201);
    expect(mocks.storeSongGuessClip).toHaveBeenCalledWith("board-1", wavFile, {
      tierMs: 500,
      mimeType: "audio/wav",
      sizeBytes: 100,
      durationMs: 500,
    });
  });

  it("returns only an opaque asset descriptor after teacher-authorized storage", async () => {
    const response = await POST(
      request({ assetKind: "clip", tierMs: "500", durationMs: "500" }),
      { params: Promise.resolve({ boardId: "board-1" }) },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "asset-500",
      tierMs: 500,
      mimeType: "audio/webm",
      sizeBytes: 100,
      durationMs: 500,
    });
    expect(mocks.storeSongGuessClip).toHaveBeenCalledWith(
      "board-1",
      expect.any(Object),
      { tierMs: 500, mimeType: "audio/webm", sizeBytes: 100, durationMs: 500 },
    );
  });
});
