import "server-only";

import { db } from "@/lib/db";
import {
  isSongGuessCatalogCategory,
  isSongGuessCatalogSegment,
  isSafeSongGuessCatalogObjectKey,
  type SongGuessCatalogCategory,
  type SongGuessCatalogEntry,
  type SongGuessCatalogClip,
  type SongGuessCatalogSegment,
} from "./catalog";

export async function loadSongGuessCatalogFromDb(): Promise<SongGuessCatalogEntry[]> {
  const songs = await db.songGuessCatalogSong.findMany({
    include: { clips: true },
    orderBy: { id: "asc" },
  });
  return songs.map((song) => {
    const aliases = readStringArray(song.aliases, "invalid_song_guess_catalog_aliases");
    const categories = readStringArray(song.categories, "invalid_song_guess_catalog_categories");
    if (
      categories.some((category) => !isSongGuessCatalogCategory(category)) ||
      new Set(categories).size !== categories.length
    ) {
      throw new Error("invalid_song_guess_catalog_categories");
    }
    if (!song.id || !song.title || !song.artist || !song.sourceUrl || categories.length === 0) {
      throw new Error("invalid_song_guess_catalog_db_row");
    }
    const clips: Partial<Record<SongGuessCatalogSegment, SongGuessCatalogClip>> = {};
    for (const clip of song.clips) {
      if (!isSongGuessCatalogSegment(clip.segment)) {
        throw new Error("invalid_song_guess_catalog_db_clip");
      }
      if (
        clip.mimeType !== "audio/wav" ||
        clip.durationMs !== 15_000 ||
        clip.sizeBytes <= 0 ||
        !/^[a-f0-9]{64}$/.test(clip.sha256) ||
        !isSafeSongGuessCatalogObjectKey(clip.objectKey)
      ) {
        throw new Error("invalid_song_guess_catalog_db_clip");
      }
      clips[clip.segment] = {
        objectKey: clip.objectKey,
        mimeType: "audio/wav",
        durationMs: clip.durationMs,
        sizeBytes: clip.sizeBytes,
        sha256: clip.sha256,
      };
    }
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      aliases,
      categories: categories as SongGuessCatalogCategory[],
      sourceUrl: song.sourceUrl,
      sourceMetadata: isJsonRecord(song.sourceMetadata) ? song.sourceMetadata : undefined,
      clips,
    };
  });
}

function readStringArray(value: unknown, error: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(error);
  }
  return value.map((item) => String(item));
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
