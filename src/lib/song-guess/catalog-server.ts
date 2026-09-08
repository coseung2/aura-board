import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadSongGuessTeacherBoard } from "@/lib/play-platform/actor";
import { downloadPrivateObject } from "@/lib/media-storage";
import {
  deleteUploadedSongGuessClip,
  saveSongGuessSetup,
  storeSongGuessClip,
} from "@/lib/song-guess/server";
import {
  SONG_GUESS_HIGHLIGHT_MS,
  SONG_GUESS_ALLOWED_MIME_TYPES,
  validateSongGuessWavBytes,
  type SongGuessSetupInput,
} from "@/lib/song-guess/contracts";
import {
  normalizeSongGuessCatalogManifest,
  isSafeSongGuessCatalogObjectKey,
  selectSongGuessCatalogEntries,
  summarizeSongGuessCatalog,
  type SongGuessCatalogEntry,
  type SongGuessCatalogSelection,
  type SongGuessCatalogSegment,
} from "./catalog";
import { loadSongGuessCatalogFromDb } from "./catalog-db";

const DEFAULT_MANIFEST_PATH = path.join(
  process.cwd(),
  "data",
  "song-guess",
  "catalog.json",
);
const CATALOG_CLIPS_ROOT = path.join(
  process.cwd(),
  "data",
  "song-guess",
  "clips",
);

export async function loadSongGuessCatalog(
  manifestPath?: string,
): Promise<SongGuessCatalogEntry[]> {
  if (!manifestPath) return loadSongGuessCatalogFromDb();
  return loadSongGuessCatalogFromFile(manifestPath);
}

export async function loadSongGuessCatalogFromFile(
  manifestPath = DEFAULT_MANIFEST_PATH,
): Promise<SongGuessCatalogEntry[]> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch {
    throw new Error("song_guess_catalog_unavailable");
  }
  try {
    return normalizeSongGuessCatalogManifest(JSON.parse(raw) as unknown);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("invalid_song_guess_catalog")
    ) {
      throw error;
    }
    throw new Error("invalid_song_guess_catalog_manifest");
  }
}

export async function loadSongGuessCatalogSummary(): Promise<
  ReturnType<typeof summarizeSongGuessCatalog>
> {
  const entries = await loadSongGuessCatalog();
  return summarizeSongGuessCatalog(entries);
}

export type SongGuessCatalogSetupResult = {
  segment: SongGuessCatalogSegment;
  songs: Array<
    Pick<
      SongGuessCatalogEntry,
      "id" | "title" | "artist" | "categories" | "sourceUrl"
    >
  >;
  setup: Awaited<ReturnType<typeof saveSongGuessSetup>>;
};

/** Select, validate, upload, and persist a teacher's pooled-song game. */
export async function createSongGuessSetupFromCatalog(
  boardId: string,
  selection: SongGuessCatalogSelection,
): Promise<SongGuessCatalogSetupResult> {
  await loadSongGuessTeacherBoard(boardId);
  const entries = await loadSongGuessCatalog();
  const selected = selectSongGuessCatalogEntries(entries, selection);
  const uploadedIds: string[] = [];
  try {
    const rounds: SongGuessSetupInput["rounds"] = [];
    for (const entry of selected) {
      const clip = entry.clips[selection.segment];
      if (!clip) throw new Error("song_guess_catalog_insufficient_songs");
      const uploaded = await materializeCatalogClip(
        boardId,
        entry.id,
        selection.segment,
        clip,
      );
      uploadedIds.push(uploaded.id);
      rounds.push({
        representativeAnswer: entry.title,
        artist: entry.artist,
        aliases: entry.aliases,
        accessibilityClue: null,
        clipAssetIds: [uploaded.id],
      });
    }
    const setup = await saveSongGuessSetup(boardId, { rounds });
    return {
      segment: selection.segment,
      songs: selected.map(({ id, title, artist, categories, sourceUrl }) => ({
        id,
        title,
        artist,
        categories,
        sourceUrl,
      })),
      setup,
    };
  } catch (error) {
    await Promise.all(
      uploadedIds.map((assetId) =>
        deleteUploadedSongGuessClip(boardId, assetId).catch(() => false),
      ),
    );
    throw error;
  }
}

async function readCatalogClip(
  file: string,
  segment: SongGuessCatalogSegment,
): Promise<Buffer> {
  const resolved = resolveCatalogClipPath(file, segment);
  let bytes: Buffer;
  try {
    bytes = await readFile(resolved);
  } catch {
    throw new Error("song_guess_catalog_clip_unavailable");
  }
  bytes = canonicalizeCatalogWav(bytes);
  if (
    validateSongGuessWavBytes(bytes, SONG_GUESS_HIGHLIGHT_MS) !== null ||
    bytes.byteLength === 0
  ) {
    throw new Error("song_guess_catalog_invalid_clip");
  }
  return bytes;
}

/** Remove optional RIFF metadata chunks so checked-in WAVs use the runtime's
 * exact 44-byte PCM header contract. Audio samples are copied unchanged. */
export function canonicalizeCatalogWav(bytes: Buffer): Buffer {
  if (
    bytes.byteLength < 44 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("song_guess_catalog_invalid_clip");
  }
  let offset = 12;
  let fmt: {
    format: number;
    channels: number;
    sampleRate: number;
    byteRate: number;
    blockAlign: number;
    bits: number;
  } | null = null;
  let dataStart = -1;
  let dataLength = -1;
  while (offset + 8 <= bytes.byteLength) {
    const chunk = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > bytes.byteLength)
      throw new Error("song_guess_catalog_invalid_clip");
    if (chunk === "fmt " && length >= 16) {
      fmt = {
        format: bytes.readUInt16LE(start),
        channels: bytes.readUInt16LE(start + 2),
        sampleRate: bytes.readUInt32LE(start + 4),
        byteRate: bytes.readUInt32LE(start + 8),
        blockAlign: bytes.readUInt16LE(start + 12),
        bits: bytes.readUInt16LE(start + 14),
      };
    } else if (chunk === "data") {
      dataStart = start;
      dataLength = length;
      break;
    }
    offset = start + length + (length % 2);
  }
  if (
    !fmt ||
    dataStart < 0 ||
    dataLength < 1 ||
    fmt.format !== 1 ||
    fmt.channels !== 1 ||
    fmt.sampleRate !== 44_100 ||
    fmt.byteRate !== 88_200 ||
    fmt.blockAlign !== 2 ||
    fmt.bits !== 16
  ) {
    throw new Error("song_guess_catalog_invalid_clip");
  }
  const canonical = Buffer.allocUnsafe(44 + dataLength);
  canonical.write("RIFF", 0, "ascii");
  canonical.writeUInt32LE(36 + dataLength, 4);
  canonical.write("WAVEfmt ", 8, "ascii");
  canonical.writeUInt32LE(16, 16);
  canonical.writeUInt16LE(1, 20);
  canonical.writeUInt16LE(1, 22);
  canonical.writeUInt32LE(44_100, 24);
  canonical.writeUInt32LE(88_200, 28);
  canonical.writeUInt16LE(2, 32);
  canonical.writeUInt16LE(16, 34);
  canonical.write("data", 36, "ascii");
  canonical.writeUInt32LE(dataLength, 40);
  bytes.copy(canonical, 44, dataStart, dataStart + dataLength);
  return canonical;
}

async function uploadCatalogWavClip(
  boardId: string,
  songId: string,
  segment: SongGuessCatalogSegment,
  clip: Extract<SongGuessCatalogEntry["clips"][SongGuessCatalogSegment], { file: string }>,
) {
  const bytes = await readCatalogClip(clip.file, segment);
  const file = createCatalogFile(bytes, `${songId}-${segment}.wav`);
  return storeSongGuessClip(boardId, file, {
    tierMs: SONG_GUESS_HIGHLIGHT_MS,
    mimeType: "audio/wav",
    sizeBytes: bytes.byteLength,
    durationMs: SONG_GUESS_HIGHLIGHT_MS,
  });
}

async function materializeCatalogClip(
  boardId: string,
  songId: string,
  segment: SongGuessCatalogSegment,
  clip: SongGuessCatalogEntry["clips"][SongGuessCatalogSegment],
) {
  if (!clip) throw new Error("song_guess_catalog_audio_unavailable");
  if ("file" in clip) return uploadCatalogWavClip(boardId, songId, segment, clip);
  if (!isSongGuessCatalogClipDb(clip)) {
    throw new Error("song_guess_catalog_audio_unavailable");
  }
  let body: Buffer;
  try {
    body = Buffer.from((await downloadPrivateObject(clip.objectKey)).body);
  } catch {
    throw new Error("song_guess_catalog_clip_unavailable");
  }
  body = canonicalizeCatalogWav(body);
  if (
    body.byteLength !== clip.sizeBytes ||
    createHash("sha256").update(body).digest("hex") !== clip.sha256 ||
    validateSongGuessWavBytes(body, SONG_GUESS_HIGHLIGHT_MS) !== null
  ) {
    throw new Error("song_guess_catalog_invalid_clip");
  }
  const file = createCatalogFile(body, `${songId}-${segment}.wav`);
  return storeSongGuessClip(boardId, file, {
    tierMs: SONG_GUESS_HIGHLIGHT_MS,
    mimeType: "audio/wav",
    sizeBytes: body.byteLength,
    durationMs: SONG_GUESS_HIGHLIGHT_MS,
  });
}

function isSongGuessCatalogClipDb(
  clip: SongGuessCatalogEntry["clips"][SongGuessCatalogSegment],
): clip is { objectKey: string; mimeType: "audio/wav"; durationMs: number; sizeBytes: number; sha256: string } {
  return !!clip && "objectKey" in clip && isSafeSongGuessCatalogObjectKey(clip.objectKey);
}

export function resolveCatalogClipPath(
  file: string,
  segment: SongGuessCatalogSegment,
): string {
  if (
    typeof file !== "string" ||
    !file.trim() ||
    !file.toLowerCase().endsWith(".wav")
  ) {
    throw new Error("invalid_song_guess_catalog_clip_path");
  }
  const relative = file.trim().replaceAll("\\", "/");
  const parts = relative.split("/");
  const clipParts = parts[0] === "clips" ? parts.slice(1) : parts;
  if (
    path.posix.isAbsolute(relative) ||
    parts.some((part) => part === "" || part === "." || part === "..") ||
    clipParts.at(-1) !== `${segment}.wav` ||
    clipParts.length !== 2
  ) {
    throw new Error("invalid_song_guess_catalog_clip_path");
  }
  const resolved = path.resolve(CATALOG_CLIPS_ROOT, ...clipParts);
  const root = `${path.resolve(CATALOG_CLIPS_ROOT)}${path.sep}`;
  if (!resolved.startsWith(root))
    throw new Error("invalid_song_guess_catalog_clip_path");
  return resolved;
}

function createCatalogFile(bytes: Buffer, name: string): File {
  if (typeof File !== "undefined") {
    const copy = Uint8Array.from(bytes);
    return new File([copy.buffer], name, {
      type: SONG_GUESS_ALLOWED_MIME_TYPES[0],
    });
  }
  return {
    name,
    type: "audio/wav",
    size: bytes.byteLength,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as File;
}
