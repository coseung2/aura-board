import { describe, expect, it } from "vitest";
import { resolveSongGuessArtist, transformSongGuessAnswer } from "./answer-target";
import { normalizeSongGuessSetup } from "./contracts";

const source = { representativeAnswer: "밤편지", aliases: ["Through the Night"], artist: "아이유" };
describe("song answer target", () => {
  it("uses title aliases only for title answers and combines both for artist-title", () => {
    expect(transformSongGuessAnswer(source, "title").aliases).toEqual(["Through the Night"]);
    expect(transformSongGuessAnswer(source, "artist")).toMatchObject({ representativeAnswer: "아이유", aliases: [] });
    expect(transformSongGuessAnswer(source, "artist-title")).toMatchObject({ representativeAnswer: "아이유 - 밤편지", aliases: ["아이유 - Through the Night"] });
  });
  it("resolves legacy artist only from an unambiguous matching song", () => {
    const legacy = { ...source, artist: null };
    expect(resolveSongGuessArtist(legacy, [{ title: "밤편지", aliases: source.aliases, artist: "아이유" }])).toBe("아이유");
    expect(resolveSongGuessArtist(legacy, [
      { title: "밤편지", aliases: source.aliases, artist: "아이유" },
      { title: "밤편지", aliases: source.aliases, artist: "다른 가수" },
    ])).toBeNull();
    expect(() => transformSongGuessAnswer(legacy, "artist")).toThrow("song_guess_artist_required");
  });
  it("preserves normalized artist on a manually saved pack", () => {
    const input = { rounds: [{ ...source, artist: " 아이유 ", clipAssetIds: ["asset"] }] };
    expect(normalizeSongGuessSetup(input).rounds[0].artist).toBe("아이유");
    expect(() => normalizeSongGuessSetup({ rounds: [{ ...input.rounds[0], artist: "a".repeat(201) }] })).toThrow("invalid_song_guess_artist");
  });
});
