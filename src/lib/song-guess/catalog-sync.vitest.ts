import { describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncSongGuessCatalog } from "../../../scripts/song-guess-catalog-sync";

function wav15s(): Buffer {
  const dataLength = 44_100 * 15 * 2;
  const bytes = Buffer.alloc(44 + dataLength);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(36 + dataLength, 4);
  bytes.write("WAVEfmt ", 8, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(44_100, 24);
  bytes.writeUInt32LE(88_200, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(dataLength, 40);
  return bytes;
}

describe("song-guess catalog sync", () => {
  it("dry-runs metadata and reports local playable clips without writing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "song-guess-sync-"));
    const manifestPath = path.join(root, "catalog.json");
    await fs.mkdir(path.join(root, "clips", "song-1"), { recursive: true });
    await fs.writeFile(path.join(root, "clips", "song-1", "highlight.wav"), wav15s());
    await fs.writeFile(manifestPath, JSON.stringify({ version: 1, songs: [{
      id: "song-1", title: "Song", artist: "Artist", aliases: [], categories: ["classical"],
      sourceUrl: "https://example.test/song", sourceMetadata: { originalVideoId: "dQw4w9WgXcQ", highlightStartSeconds: 2 }, clips: { highlight: { file: "clips/song-1/highlight.wav" } },
    }, {
      id: "metadata-only", title: "Metadata", artist: "Artist", aliases: [], categories: ["2020s"],
      sourceUrl: "https://example.test/meta", clips: { highlight: { videoId: "dQw4w9WgXcQ", startSeconds: 2 } },
    }] }));
    const songUpsert = vi.fn();
    const clipUpsert = vi.fn();
    const clipFind = vi.fn();
    const result = await syncSongGuessCatalog({
      manifestPath,
      dbClient: {
        songGuessCatalogSong: { upsert: songUpsert },
        songGuessCatalogClip: { findUnique: clipFind, upsert: clipUpsert },
      },
      storage: { uploadPrivateObject: vi.fn() },
    });
    expect(result).toMatchObject({ dryRun: true, metadataRows: 2, playableRows: 1, uploadedClips: 0, plannedUploads: 1, missingAudio: [] });
    expect(songUpsert).not.toHaveBeenCalled();
    const applied = await syncSongGuessCatalog({
      manifestPath,
      apply: true,
      dbClient: {
        songGuessCatalogSong: { upsert: songUpsert },
        songGuessCatalogClip: { findUnique: clipFind, upsert: clipUpsert },
      },
      storage: { uploadPrivateObject: vi.fn() },
    });
    expect(applied.uploadedClips).toBe(1);
    expect(songUpsert.mock.calls[0]?.[0].create.sourceMetadata).toEqual({ originalVideoId: "dQw4w9WgXcQ", highlightStartSeconds: 2 });
    const savedClip = clipUpsert.mock.calls[0]?.[0].create;
    clipFind.mockResolvedValue({ sha256: savedClip.sha256, objectKey: savedClip.objectKey });
    const upload = vi.fn();
    const repeated = await syncSongGuessCatalog({ manifestPath, apply: true,
      dbClient: { songGuessCatalogSong: { upsert: songUpsert }, songGuessCatalogClip: { findUnique: clipFind, upsert: clipUpsert } },
      storage: { uploadPrivateObject: upload },
    });
    expect(repeated.unchangedClips).toBe(1);
    expect(upload).not.toHaveBeenCalled();
    await fs.rm(root, { recursive: true, force: true });
  });
});
