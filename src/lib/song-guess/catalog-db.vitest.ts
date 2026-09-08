import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  db: { songGuessCatalogSong: { findMany } },
}));

import { loadSongGuessCatalogFromDb } from "./catalog-db";

describe("database-backed song-guess catalog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps metadata rows and private audio clips without exposing answers", async () => {
    findMany.mockResolvedValue([{
      id: "song-1",
      title: "Song One",
      artist: "Artist",
      aliases: ["Song 1"],
      categories: ["classical"],
      sourceUrl: "https://example.test/song-1",
      sourceMetadata: { originalVideoId: "dQw4w9WgXcQ", highlightStartSeconds: 2 },
      clips: [{
        segment: "highlight",
        objectKey: "song-guess/catalog/song-1/highlight/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.wav",
        mimeType: "audio/wav",
        durationMs: 15_000,
        sizeBytes: 123,
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }],
    }]);
    await expect(loadSongGuessCatalogFromDb()).resolves.toEqual([{
      id: "song-1",
      title: "Song One",
      artist: "Artist",
      aliases: ["Song 1"],
      categories: ["classical"],
      sourceUrl: "https://example.test/song-1",
      sourceMetadata: { originalVideoId: "dQw4w9WgXcQ", highlightStartSeconds: 2 },
      clips: {
        highlight: {
          objectKey: "song-guess/catalog/song-1/highlight/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.wav",
          mimeType: "audio/wav",
          durationMs: 15_000,
          sizeBytes: 123,
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      },
    }]);
  });

  it("rejects malformed DB clips instead of falling back to files", async () => {
    findMany.mockResolvedValue([{
      id: "song-1", title: "Song", artist: "Artist", aliases: [], categories: ["classical"],
      sourceUrl: "https://example.test/song", sourceMetadata: null,
      clips: [{ segment: "highlight", objectKey: "public/song.wav", mimeType: "audio/wav", durationMs: 1, sizeBytes: 1, sha256: "bad" }],
    }]);
    await expect(loadSongGuessCatalogFromDb()).rejects.toThrow("invalid_song_guess_catalog_db_clip");
  });

  it("rejects private object keys outside the catalog namespace", async () => {
    findMany.mockResolvedValue([{
      id: "song-1", title: "Song", artist: "Artist", aliases: [], categories: ["classical"],
      sourceUrl: "https://example.test/song", sourceMetadata: null,
      clips: [{ segment: "highlight", objectKey: "song-guess/catalog/../secret.wav", mimeType: "audio/wav", durationMs: 15_000, sizeBytes: 1, sha256: "a".repeat(64) }],
    }]);
    await expect(loadSongGuessCatalogFromDb()).rejects.toThrow("invalid_song_guess_catalog_db_clip");
  });

  it("keeps metadata-only rows registered with an empty playable clip set", async () => {
    findMany.mockResolvedValue([{
      id: "metadata-only", title: "Metadata", artist: "Artist", aliases: [], categories: ["other"],
      sourceUrl: "https://example.test/meta", sourceMetadata: { originalVideoId: "dQw4w9WgXcQ" }, clips: [],
    }]);
    await expect(loadSongGuessCatalogFromDb()).resolves.toMatchObject([{
      id: "metadata-only", clips: {}, categories: ["other"],
    }]);
  });
});
