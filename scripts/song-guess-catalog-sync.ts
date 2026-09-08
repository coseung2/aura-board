import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { uploadPrivateObject } from "@/lib/media-storage";
import {
  isSongGuessCatalogClipPlayable,
  normalizeSongGuessCatalogManifest,
  type SongGuessCatalogClip,
  type SongGuessCatalogEntry,
  type SongGuessCatalogSegment,
} from "@/lib/song-guess/catalog";
import { validateSongGuessWavBytes } from "@/lib/song-guess/contracts";

type CatalogDb = {
  songGuessCatalogSong: {
    upsert(args: unknown): Promise<unknown>;
  };
  songGuessCatalogClip: {
    findUnique(args: unknown): Promise<{ sha256: string; objectKey: string } | null>;
    upsert(args: unknown): Promise<unknown>;
  };
};

type Storage = { uploadPrivateObject(pathname: string, body: Buffer, options: { contentType: string }): Promise<unknown> };

export type SongGuessCatalogSyncSummary = {
  dryRun: boolean;
  metadataRows: number;
  pendingAudioSongs: number;
  pendingAudioSongIds: string[];
  playableSongs: number;
  validClips: number;
  playableRows: number;
  missingAudio: string[];
  plannedUploads: number;
  uploadedClips: number;
  unchangedClips: number;
};

export async function syncSongGuessCatalog({
  manifestPath = path.join(process.cwd(), "data", "song-guess", "catalog.json"),
  apply = false,
  dbClient = db as unknown as CatalogDb,
  storage = { uploadPrivateObject },
}: {
  manifestPath?: string;
  apply?: boolean;
  dbClient?: CatalogDb;
  storage?: Storage;
} = {}): Promise<SongGuessCatalogSyncSummary> {
  const entries = await loadManifest(manifestPath);
  const summary: SongGuessCatalogSyncSummary = {
    dryRun: !apply,
    metadataRows: entries.length,
    pendingAudioSongs: 0,
    pendingAudioSongIds: [],
    playableSongs: 0,
    validClips: 0,
    playableRows: 0,
    missingAudio: [],
    plannedUploads: 0,
    uploadedClips: 0,
    unchangedClips: 0,
  };
  for (const entry of entries) {
    if (apply) await upsertSong(dbClient, entry);
    let hasPlayableAudio = false;
    for (const segment of ["intro", "highlight"] as const) {
      const clip = entry.clips[segment];
      if (!clip || !isSongGuessCatalogClipPlayable(clip) || !("file" in clip)) continue;
      const bytes = await readManifestClip(manifestPath, entry, segment, clip);
      if (!bytes) {
        summary.missingAudio.push(`${entry.id}:${segment}`);
        continue;
      }
      hasPlayableAudio = true;
      summary.validClips += 1;
      summary.playableRows = summary.validClips;
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const objectKey = `song-guess/catalog/${entry.id}/${segment}/${sha256}.wav`;
      const existing = apply
        ? await dbClient.songGuessCatalogClip.findUnique({
            where: { songId_segment: { songId: entry.id, segment } },
            select: { sha256: true, objectKey: true },
          })
        : null;
      if (existing?.sha256 === sha256 && existing.objectKey === objectKey) {
        summary.unchangedClips += 1;
        continue;
      }
      summary.plannedUploads += 1;
      if (apply) {
        await storage.uploadPrivateObject(objectKey, bytes, { contentType: "audio/wav" });
        await dbClient.songGuessCatalogClip.upsert({
          where: { songId_segment: { songId: entry.id, segment } },
          create: {
            songId: entry.id,
            segment,
            objectKey,
            mimeType: "audio/wav",
            durationMs: 15_000,
            sizeBytes: bytes.byteLength,
            sha256,
          },
          update: {
            objectKey,
            mimeType: "audio/wav",
            durationMs: 15_000,
            sizeBytes: bytes.byteLength,
            sha256,
          },
        });
      }
      if (apply) summary.uploadedClips += 1;
    }
    if (hasPlayableAudio) summary.playableSongs += 1;
    else {
      summary.pendingAudioSongs += 1;
      summary.pendingAudioSongIds.push(entry.id);
    }
  }
  return summary;
}

async function upsertSong(dbClient: CatalogDb, entry: SongGuessCatalogEntry): Promise<void> {
  await dbClient.songGuessCatalogSong.upsert({
    where: { id: entry.id },
    create: {
      id: entry.id,
      title: entry.title,
      artist: entry.artist,
      aliases: entry.aliases,
      categories: entry.categories,
      sourceUrl: entry.sourceUrl,
      sourceMetadata: entry.sourceMetadata ?? null,
    },
    update: {
      title: entry.title,
      artist: entry.artist,
      aliases: entry.aliases,
      categories: entry.categories,
      sourceUrl: entry.sourceUrl,
      sourceMetadata: entry.sourceMetadata ?? null,
    },
  });
}

async function readManifestClip(
  manifestPath: string,
  entry: SongGuessCatalogEntry,
  segment: SongGuessCatalogSegment,
  clip: Extract<SongGuessCatalogClip, { file: string }> | Extract<SongGuessCatalogClip, { objectKey: string }>,
): Promise<Buffer | null> {
  if (!("file" in clip)) return null;
  const relative = clip.file.replaceAll("\\", "/");
  const parts = relative.split("/");
  const clipsIndex = parts.indexOf("clips");
  const clipParts = clipsIndex >= 0 ? parts.slice(clipsIndex + 1) : parts;
  if (clipsIndex < 0 || clipParts.length !== 2 || clipParts[0] !== entry.id || clipParts[1] !== `${segment}.wav` || parts.some((part) => part === ".." || part === "." || part === "")) {
    throw new Error("invalid_song_guess_catalog_clip_path");
  }
  const filePath = clipsIndex === 0
    ? path.resolve(path.dirname(manifestPath), "clips", ...clipParts)
    : path.resolve(process.cwd(), ...parts);
  const clipRoot = clipsIndex === 0
    ? path.resolve(path.dirname(manifestPath), "clips")
    : path.resolve(process.cwd(), "data", "song-guess", "clips");
  if (!filePath.startsWith(`${clipRoot}${path.sep}`)) {
    throw new Error("invalid_song_guess_catalog_clip_path");
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch {
    return null;
  }
  const canonical = canonicalizeSyncWav(bytes);
  if (validateSongGuessWavBytes(canonical, 15_000) !== null) {
    throw new Error("song_guess_catalog_invalid_clip");
  }
  return canonical;
}

async function loadManifest(manifestPath: string): Promise<SongGuessCatalogEntry[]> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch {
    throw new Error("song_guess_catalog_unavailable");
  }
  return normalizeSongGuessCatalogManifest(JSON.parse(raw) as unknown);
}

function canonicalizeSyncWav(bytes: Buffer): Buffer {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("song_guess_catalog_invalid_clip");
  }
  let offset = 12;
  let fmt: { format: number; channels: number; sampleRate: number; byteRate: number; blockAlign: number; bits: number } | null = null;
  let dataStart = -1;
  let dataLength = -1;
  while (offset + 8 <= bytes.length) {
    const chunk = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > bytes.length) throw new Error("song_guess_catalog_invalid_clip");
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
  if (!fmt || dataStart < 0 || dataLength < 1 || fmt.format !== 1 || fmt.channels !== 1 || fmt.sampleRate !== 44_100 || fmt.byteRate !== 88_200 || fmt.blockAlign !== 2 || fmt.bits !== 16) {
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const manifestArg = args.find((arg) => !arg.startsWith("--"));
  const summary = await syncSongGuessCatalog({
    apply,
    manifestPath: manifestArg ? path.resolve(manifestArg) : undefined,
  });
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith("song-guess-catalog-sync.ts")) {
  main().catch((error) => {
    console.error(sanitizeSyncError(error));
    process.exitCode = 1;
  });
}

function sanitizeSyncError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const known = [
    "song_guess_catalog_unavailable",
    "song_guess_catalog_invalid_clip",
    "song_guess_catalog_clip_unavailable",
    "invalid_song_guess_catalog_manifest",
    "invalid_song_guess_catalog_entry",
    "invalid_song_guess_catalog_clips",
    "invalid_song_guess_catalog_clip_path",
  ];
  if (known.includes(message)) return message;
  if (message.startsWith("invalid_song_guess_catalog_")) return message.split(/[:\s]/, 1)[0]!;
  return "song_guess_catalog_sync_failed";
}
