import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSongGuessTeacherSetup, saveSongGuessTeacherSetup, uploadSongGuessClip } from "./browser-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("song-guess browser upload boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends only a tier-named derivative WAV and no original metadata", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        id: "asset-500",
        tierMs: 500,
        mimeType: "audio/wav",
        sizeBytes: 4,
        durationMs: 500,
      }, 201),
    );
    vi.stubGlobal("fetch", fetchMock);
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/wav" });

    await uploadSongGuessClip("board-1", blob, 500);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/song-guess/boards/board-1/clips");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.has("content-type")).toBe(false);
    const form = init.body as FormData;
    expect([...form.keys()]).toEqual(["assetKind", "tierMs", "durationMs", "file"]);
    expect(form.get("assetKind")).toBe("clip");
    expect(form.get("tierMs")).toBe("500");
    expect(form.get("durationMs")).toBe("500");
    const file = form.get("file") as File;
    expect(file.name).toBe("500.wav");
    expect(file.type).toBe("audio/wav");
    expect(file.size).toBe(4);
    expect(JSON.stringify([...form.entries()])).not.toContain("original");
    expect(JSON.stringify([...form.entries()])).not.toContain("source");
  });
});

function setup(tiers: number[]) {
  return {
    id: "game-1", boardId: "board-1",
    rounds: Array.from({ length: 20 }, (_, order) => ({
      id: `round-${order}`, order, representativeAnswer: `Song ${order}`,
      aliases: [], accessibilityClue: null,
      clips: tiers.map((tierMs) => ({
        id: `clip-${order}-${tierMs}`, tierMs, mimeType: "audio/wav",
        durationMs: tierMs, sizeBytes: 44 + tierMs * 88.2,
      })),
    })),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("song guess teacher setup wire responses", () => {
  it.each([[15000], [500, 1000, 1500]])("loads and saves a 20-round setup with tiers %j", async (...tiers) => {
    const response = setup(tiers);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(response)));
    expect((await fetchSongGuessTeacherSetup("board-1"))?.rounds).toHaveLength(20);
    expect((await saveSongGuessTeacherSetup("board-1", {
      rounds: response.rounds.map((round) => ({
        representativeAnswer: round.representativeAnswer,
        clipAssetIds: round.clips.map((clip) => clip.id),
      })),
    })).rounds).toHaveLength(20);
  });

  it.each([[], [500], [15000, 15000], [500, 500, 1500]])("rejects incomplete or duplicate clip tiers %j", async (...tiers) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(setup(tiers))));
    await expect(fetchSongGuessTeacherSetup("board-1")).rejects.toThrow("invalid_song_guess_teacher_setup");
  });
});
