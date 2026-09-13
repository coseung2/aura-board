import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  loadTeacherBoard: vi.fn(),
  storeClip: vi.fn(),
  saveSetup: vi.fn(),
  deleteClip: vi.fn(),
  loadDbCatalog: vi.fn(),
  downloadPrivateObject: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    default: { ...actual, readFile: mocks.readFile },
    readFile: mocks.readFile,
  };
});

vi.mock("@/lib/play-platform/actor", () => ({ loadSongGuessTeacherBoard: mocks.loadTeacherBoard }));
vi.mock("@/lib/song-guess/server", () => ({
  deleteUploadedSongGuessClip: mocks.deleteClip,
  saveSongGuessSetup: mocks.saveSetup,
  storeSongGuessClip: mocks.storeClip,
}));
vi.mock("@/lib/song-guess/catalog-db", () => ({
  loadSongGuessCatalogFromDb: mocks.loadDbCatalog,
}));
vi.mock("@/lib/media-storage", () => ({
  downloadPrivateObject: mocks.downloadPrivateObject,
}));

import { validateSongGuessWavBytes } from "./contracts";
import { canonicalizeCatalogWav, createSongGuessSetupFromCatalog, resolveCatalogClipPath } from "./catalog-server";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadTeacherBoard.mockResolvedValue({ actor: { role: "host", userId: "teacher-1" } });
  mocks.storeClip.mockResolvedValue({ id: "asset-1" });
  mocks.saveSetup.mockResolvedValue({ rounds: [] });
  mocks.readFile.mockResolvedValue(wavWithListChunk());
  mocks.loadDbCatalog.mockResolvedValue([{
    id: "chopin-waltz-no19",
    title: "Waltz No. 19",
    artist: "Frédéric Chopin",
    aliases: [],
    categories: ["classical"],
    sourceUrl: "https://example.test/chopin",
    clips: { highlight: { file: "clips/chopin-waltz-no19/highlight.wav" } },
  }]);
});

function wavWithListChunk(): Buffer {
  const dataLength = 44_100 * 15 * 2;
  const listLength = 26;
  const bytes = Buffer.alloc(44 + listLength + 8 + dataLength);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(44_100, 24);
  bytes.writeUInt32LE(88_200, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("LIST", 36, "ascii");
  bytes.writeUInt32LE(listLength, 40);
  bytes.write("INFOISFTLavf", 44, "ascii");
  const dataOffset = 44 + listLength;
  bytes.write("data", dataOffset, "ascii");
  bytes.writeUInt32LE(dataLength, dataOffset + 4);
  return bytes;
}

describe("song-guess catalog WAV normalization", () => {
  it("strips optional RIFF metadata while preserving exact PCM duration", () => {
    const canonical = canonicalizeCatalogWav(wavWithListChunk());
    expect(validateSongGuessWavBytes(canonical, 15_000)).toBeNull();
    expect(canonical.byteLength).toBe(44 + 44_100 * 15 * 2);
    expect(canonical.toString("ascii", 36, 40)).toBe("data");
  });

  it("prepares a file-backed classical WAV as a private audio upload", async () => {
    const result = await createSongGuessSetupFromCatalog("board-1", {
      categories: ["classical"],
      segment: "highlight",
      count: 1,
    });
    expect(result.songs).toHaveLength(1);
    expect(mocks.storeClip).toHaveBeenCalledTimes(1);
    const [, file, metadata] = mocks.storeClip.mock.calls[0]!;
    expect(metadata).toMatchObject({ tierMs: 15_000, mimeType: "audio/wav", durationMs: 15_000 });
    const bytes = Buffer.from(await file.arrayBuffer());
    expect(validateSongGuessWavBytes(bytes, 15_000)).toBeNull();
    expect(mocks.saveSetup).toHaveBeenCalledWith("board-1", {
      rounds: [{ representativeAnswer: result.songs[0]!.title, artist: result.songs[0]!.artist, aliases: expect.any(Array), accessibilityClue: null, clipAssetIds: ["asset-1"] }],
    });
  });

  it("materializes a DB private clip into a board-owned setup asset", async () => {
    const bytes = canonicalizeCatalogWav(wavWithListChunk());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const objectKey = `song-guess/catalog/db-song/highlight/${sha256}.wav`;
    mocks.loadDbCatalog.mockResolvedValue([{
      id: "db-song",
      title: "DB Song",
      artist: "Artist",
      aliases: [],
      categories: ["classical"],
      sourceUrl: "https://example.test/db-song",
      clips: {
        highlight: { objectKey, mimeType: "audio/wav", durationMs: 15_000, sizeBytes: bytes.byteLength, sha256 },
      },
    }]);
    mocks.downloadPrivateObject.mockResolvedValue({ body: bytes });
    const result = await createSongGuessSetupFromCatalog("board-1", {
      categories: ["classical"], segment: "highlight", count: 1,
    });
    expect(result.songs[0]?.id).toBe("db-song");
    expect(mocks.downloadPrivateObject).toHaveBeenCalledWith(objectKey);
    expect(mocks.storeClip).toHaveBeenCalledTimes(1);
  });

  it("rejects catalog file paths that escape the clips root", () => {
    expect(() => resolveCatalogClipPath("clips/../secret/highlight.wav", "highlight")).toThrow(
      "invalid_song_guess_catalog_clip_path",
    );
  });
});
