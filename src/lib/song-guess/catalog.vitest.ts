import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  normalizeSongGuessCatalogManifest,
  isSongGuessCatalogClipPlayable,
  selectSongGuessCatalogEntries,
  summarizeSongGuessCatalog,
  type SongGuessCatalogEntry,
} from "./catalog";

function entry(
  id: string,
  categories: SongGuessCatalogEntry["categories"],
  clips: SongGuessCatalogEntry["clips"] = {
    intro: { file: `${id}/intro.wav` },
  },
): SongGuessCatalogEntry {
  return {
    id,
    title: `Song ${id}`,
    artist: "Artist",
    aliases: [],
    categories,
    sourceUrl: "https://example.com/source",
    clips,
  };
}

describe("song-guess pooled catalog", () => {
  it("does not count remote-video metadata as playable audio", () => {
    expect(isSongGuessCatalogClipPlayable({ videoId: "ccc", startSeconds: 0 })).toBe(false);
    expect(isSongGuessCatalogClipPlayable({ videoId: "wcIY33Q1GmE", startSeconds: 3 })).toBe(false);
    expect(isSongGuessCatalogClipPlayable({ file: "clips/song/highlight.wav" })).toBe(true);
  });
  it("keeps the checked-in pools populated with playable declarations", () => {
    const manifest = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "data", "song-guess", "catalog.json"),
        "utf8",
      ),
    ) as unknown;
    const entries = normalizeSongGuessCatalogManifest(manifest);
    const summary = summarizeSongGuessCatalog(entries);
    expect(entries.length).toBeGreaterThan(500);
    expect(summary.categories.find((item) => item.id === "classical")?.counts.highlight).toBeGreaterThan(0);
    expect(summary.categories.some((item) => item.id !== "classical" && item.counts.highlight > 0)).toBe(true);
    expect(summary.categories.every((item) => item.counts.intro >= 0 && item.counts.highlight >= 0)).toBe(true);
    expect(
      entries.every((entry) => entry.clips.highlight || entry.clips.intro),
    ).toBe(true);
    expect(entries.some((entry) => entry.clips.highlight && "file" in entry.clips.highlight)).toBe(true);
  });

  it("selects the union of categories and never duplicates a song", () => {
    const songs = [
      entry("girl", ["girl-idol"]),
      entry("boy", ["boy-idol"]),
      entry("both", ["girl-idol", "boy-idol"]),
      entry("classical", ["classical"]),
    ];
    const selected = selectSongGuessCatalogEntries(
      songs,
      { categories: ["girl-idol", "boy-idol"], segment: "intro", count: 3 },
      () => 0,
    );
    expect(selected).toHaveLength(3);
    expect(new Set(selected.map((song) => song.id)).size).toBe(3);
    expect(
      selected.every((song) =>
        song.categories.some((category) =>
          ["girl-idol", "boy-idol"].includes(category),
        ),
      ),
    ).toBe(true);
  });

  it("filters out songs without the requested segment", () => {
    const songs = [
      entry("intro-only", ["classical"]),
      entry("highlight-only", ["classical"], {
        highlight: { file: "highlight-only/highlight.wav" },
      }),
    ];
    expect(
      selectSongGuessCatalogEntries(songs, {
        categories: ["classical"],
        segment: "highlight",
        count: 1,
      })[0]?.id,
    ).toBe("highlight-only");
    const summary = summarizeSongGuessCatalog(songs);
    expect(
      summary.categories.find((category) => category.id === "classical")
        ?.counts,
    ).toEqual({ intro: 1, highlight: 1 });
  });

  it("fails clearly when the playable pool is smaller than requested", () => {
    expect(() =>
      selectSongGuessCatalogEntries([entry("only", ["girl-idol"])], {
        categories: ["girl-idol"],
        segment: "intro",
        count: 2,
      }),
    ).toThrow("song_guess_catalog_insufficient_songs");
  });

  it("rejects a video-only pool as unavailable audio", () => {
    expect(() => selectSongGuessCatalogEntries([
      entry("video-only", ["girl-idol"], { highlight: { videoId: "dQw4w9WgXcQ", startSeconds: 0 } }),
    ], { categories: ["girl-idol"], segment: "highlight", count: 1 })).toThrow(
      "song_guess_catalog_insufficient_songs",
    );
  });

  it("rejects duplicate IDs and unsupported categories in the manifest", () => {
    const raw = {
      songs: [
        {
          id: "same",
          title: "One",
          artist: "Artist",
          aliases: [],
          categories: ["classical"],
          sourceUrl: "https://example.com/one",
          clips: { highlight: { file: "same/highlight.wav" } },
        },
        {
          id: "same",
          title: "Two",
          artist: "Artist",
          aliases: [],
          categories: ["classical"],
          sourceUrl: "https://example.com/two",
          clips: { highlight: { file: "same-2/highlight.wav" } },
        },
      ],
    };
    expect(() => normalizeSongGuessCatalogManifest(raw)).toThrow(
      "invalid_song_guess_catalog_entry",
    );
  });

  it("rejects reserved traversal IDs while preserving metadata-only rows", () => {
    expect(() => normalizeSongGuessCatalogManifest({ songs: [{
      id: "..",
      title: "Traversal",
      artist: "Artist",
      aliases: [],
      categories: ["other"],
      sourceUrl: "https://example.test/traversal",
      clips: { highlight: { videoId: "dQw4w9WgXcQ", startSeconds: 0 } },
    }] })).toThrow("invalid_song_guess_catalog_entry");
  });
});
