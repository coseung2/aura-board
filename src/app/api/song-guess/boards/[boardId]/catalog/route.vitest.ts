import { beforeEach, describe, expect, it, vi } from "vitest";

const PlayAccessError = vi.hoisted(
  () =>
    class PlayAccessError extends Error {
      status: number;
      code: string;
      constructor(status: number, code: string) {
        super(code);
        this.status = status;
        this.code = code;
      }
    },
);

const mocks = vi.hoisted(() => ({
  loadTeacherBoard: vi.fn(),
  loadSummary: vi.fn(),
  createSetup: vi.fn(),
}));

vi.mock("@/lib/play-platform/actor", () => ({
  loadSongGuessTeacherBoard: mocks.loadTeacherBoard,
  PlayAccessError,
}));

vi.mock("@/lib/song-guess/catalog-server", () => ({
  loadSongGuessCatalogSummary: mocks.loadSummary,
  createSongGuessSetupFromCatalog: mocks.createSetup,
}));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ boardId: "board-1" }) };

function request(body: unknown): Request {
  return new Request("http://localhost/api/song-guess/boards/board-1/catalog", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("song-guess catalog route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadTeacherBoard.mockResolvedValue({
      actor: { role: "host", userId: "teacher-1" },
    });
    mocks.loadSummary.mockResolvedValue({ categories: [], songs: [] });
    mocks.createSetup.mockResolvedValue({
      segment: "highlight",
      songs: [],
      setup: { rounds: [] },
    });
  });

  it("requires teacher access for the catalog listing", async () => {
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect(mocks.loadTeacherBoard).toHaveBeenCalledWith("board-1");
    expect(await response.json()).toEqual({ categories: [], songs: [] });

    mocks.loadTeacherBoard.mockRejectedValueOnce(
      new PlayAccessError(403, "forbidden"),
    );
    const failed = await GET(new Request("http://localhost"), context);
    expect(failed.status).toBe(403);
    expect(await failed.json()).toEqual({ error: "forbidden" });
  });

  it("accepts all categories as an empty selection and forwards segment/count", async () => {
    const response = await POST(
      request({ categories: [], segment: "intro", count: 3 }),
      context,
    );
    expect(response.status).toBe(201);
    expect(mocks.createSetup).toHaveBeenCalledWith("board-1", {
      categories: [],
      segment: "intro",
      count: 3,
    });
  });

  it("rejects malformed selections before preparing a setup", async () => {
    const response = await POST(
      request({
        categories: ["not-a-category"],
        segment: "highlight",
        count: 3,
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid_catalog_selection",
    });
    expect(mocks.createSetup).not.toHaveBeenCalled();
  });

  it("returns a useful 400 when the playable pool is too small", async () => {
    mocks.createSetup.mockRejectedValueOnce(
      new Error("song_guess_catalog_insufficient_songs"),
    );
    const response = await POST(
      request({ categories: ["classical"], segment: "highlight", count: 10 }),
      context,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "song_guess_catalog_insufficient_songs",
    });
  });
});
