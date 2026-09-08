import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn as nodeSpawn } from "node:child_process";
import crypto from "node:crypto";

export const SONG_GUESS_CATEGORIES = [
  "girl-idol",
  "boy-idol",
  "2000s",
  "2010s",
  "classical",
];
export const SEGMENTS = ["intro", "highlight"];
export const SEGMENT_DURATION_SECONDS = 15;
export const SAMPLE_RATE = 44_100;
export const CHANNELS = 1;
export const BITS_PER_SAMPLE = 16;
export const PCM_DATA_BYTES = SAMPLE_RATE * SEGMENT_DURATION_SECONDS * 2;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const DEFAULT_CATALOG = path.join(
  repoRoot,
  "data",
  "song-guess",
  "catalog.json",
);
const DEFAULT_CLIPS_ROOT = path.join(repoRoot, "data", "song-guess", "clips");
const ID_PATTERN = /^[A-Za-z0-9._-]+$/;

function fail(message) {
  throw new Error(message);
}

function nonEmptyString(value, field, max = 2_000) {
  if (typeof value !== "string") fail(`invalid_${field}`);
  const result = value.trim();
  if (!result || result.length > max) fail(`invalid_${field}`);
  return result;
}

function finiteStart(value, field) {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 86_400
  ) {
    fail(`invalid_${field}`);
  }
  return value;
}

function stringArray(value, field, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems)
    fail(`invalid_${field}`);
  const values = value.map((item) => nonEmptyString(item, field, maxLength));
  if (new Set(values).size !== values.length) fail(`invalid_${field}`);
  return values;
}

function validateSourceUrl(value) {
  const sourceUrl = nonEmptyString(value, "song_guess_catalog_source", 2_000);
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      throw new Error();
  } catch {
    fail("invalid_song_guess_catalog_source");
  }
  return sourceUrl;
}

function validateId(value) {
  const id = nonEmptyString(value, "song_guess_catalog_id", 128);
  if (!ID_PATTERN.test(id) || id === "." || id === "..")
    fail("invalid_song_guess_catalog_id");
  return id;
}

function validateCategories(value) {
  const categories = stringArray(
    value,
    "song_guess_catalog_categories",
    SONG_GUESS_CATEGORIES.length,
    40,
  );
  if (
    categories.length === 0 ||
    categories.some((category) => !SONG_GUESS_CATEGORIES.includes(category))
  ) {
    fail("invalid_song_guess_catalog_category");
  }
  return categories;
}

/** Validate the administrator input without reading or writing any audio. */
export function normalizeImportManifest(
  value,
  { sourceBaseDir = process.cwd() } = {},
) {
  if (!Array.isArray(value) || value.length === 0)
    fail("invalid_song_guess_import_manifest");
  const ids = new Set();
  return value.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      fail("invalid_song_guess_import_entry");
    const id = validateId(raw.id);
    if (ids.has(id)) fail("song_guess_import_duplicate_id");
    ids.add(id);
    const sourceFile = nonEmptyString(
      raw.sourceFile,
      "song_guess_import_source_file",
      4_000,
    );
    if (isRemoteSourcePath(sourceFile))
      fail("song_guess_import_source_must_be_local");
    const introStartSeconds = finiteStart(
      raw.introStartSeconds,
      "song_guess_import_intro_start",
    );
    const highlightStartSeconds = finiteStart(
      raw.highlightStartSeconds,
      "song_guess_import_highlight_start",
    );
    if (
      introStartSeconds === undefined &&
      highlightStartSeconds === undefined
    ) {
      fail("song_guess_import_missing_segment");
    }
    return {
      id,
      title: nonEmptyString(raw.title, "song_guess_catalog_title", 200),
      artist: nonEmptyString(raw.artist, "song_guess_catalog_artist", 200),
      aliases: stringArray(
        raw.aliases ?? [],
        "song_guess_catalog_aliases",
        20,
        200,
      ),
      categories: validateCategories(raw.categories),
      sourceFile: path.resolve(sourceBaseDir, sourceFile),
      sourceUrl: validateSourceUrl(raw.sourceUrl),
      introStartSeconds,
      highlightStartSeconds,
    };
  });
}

function isRemoteSourcePath(value) {
  // Windows drive paths (for example `C:\\audio\\song.wav`) contain a colon
  // but are still local files. URI schemes and UNC-style URL forms remain
  // rejected so the importer never downloads a remote recording.
  if (/^[A-Za-z]:[\\/]/.test(value)) return false;
  return /^[a-z][a-z\d+.-]*:/i.test(value);
}

function outputClipPath(clipsRoot, id, segment) {
  if (!ID_PATTERN.test(id) || !SEGMENTS.includes(segment))
    fail("invalid_song_guess_catalog_clip_path");
  return path.join(clipsRoot, id, `${segment}.wav`);
}

function validateCatalogClipFile(file, id, segment) {
  const expected = `clips/${id}/${segment}.wav`;
  if (file !== expected) fail("invalid_song_guess_catalog_clip_path");
  return expected;
}

function normalizeExistingCatalog(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.songs)) {
    fail("invalid_song_guess_catalog_manifest");
  }
  if (value.version !== undefined && value.version !== 1) {
    fail("invalid_song_guess_catalog_version");
  }
  const ids = new Set();
  return value.songs.map((song) => {
    if (!song || typeof song !== "object")
      fail("invalid_song_guess_catalog_entry");
    const id = validateId(song.id);
    if (ids.has(id)) fail("song_guess_catalog_duplicate_id");
    ids.add(id);
    const clips = {};
    if (!song.clips || typeof song.clips !== "object")
      fail("invalid_song_guess_catalog_clips");
    for (const segment of SEGMENTS) {
      if (song.clips[segment] === undefined) continue;
      const clip = song.clips[segment];
      if (!clip || typeof clip !== "object") {
        fail("invalid_song_guess_catalog_clips");
      }
      if (typeof clip.file === "string") {
        clips[segment] = {
          file: validateCatalogClipFile(clip.file, id, segment),
        };
      } else if (
        typeof clip.videoId === "string" &&
        /^[A-Za-z0-9_-]{11}$/.test(clip.videoId) &&
        typeof clip.startSeconds === "number" &&
        Number.isFinite(clip.startSeconds) &&
        clip.startSeconds >= 0
      ) {
        clips[segment] = {
          videoId: clip.videoId,
          startSeconds: clip.startSeconds,
        };
      } else {
        fail("invalid_song_guess_catalog_clips");
      }
    }
    if (Object.keys(clips).length === 0)
      fail("invalid_song_guess_catalog_clips");
    return {
      id,
      title: nonEmptyString(song.title, "song_guess_catalog_title", 200),
      artist: nonEmptyString(song.artist, "song_guess_catalog_artist", 200),
      aliases: stringArray(
        song.aliases ?? [],
        "song_guess_catalog_aliases",
        20,
        200,
      ),
      categories: validateCategories(song.categories),
      sourceUrl: validateSourceUrl(song.sourceUrl),
      clips,
    };
  });
}

async function readExistingCatalog(catalogPath) {
  try {
    return normalizeExistingCatalog(
      JSON.parse(await fs.readFile(catalogPath, "utf8")),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    if (error instanceof SyntaxError)
      fail("invalid_song_guess_catalog_manifest");
    throw error;
  }
}

function spawnProcess(spawnImpl, command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        ...options,
      });
    } catch (error) {
      reject(error);
      return;
    }
    const stdout = [];
    const stderr = [];
    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", reject);
    child.once("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8");
      const errorOutput = Buffer.concat(stderr).toString("utf8").trim();
      if (code === 0) resolve({ stdout: output, stderr: errorOutput });
      else reject(new Error(`song_guess_ffmpeg_failed:${errorOutput || code}`));
    });
  });
}

function ffprobeFor(ffmpegPath) {
  if (!ffmpegPath || !path.isAbsolute(ffmpegPath)) return "ffprobe";
  const extension = path.extname(ffmpegPath);
  return path.join(path.dirname(ffmpegPath), `ffprobe${extension}`);
}

async function probeDuration(sourceFile, { ffmpegPath, spawnImpl, cwd }) {
  const result = await spawnProcess(
    spawnImpl,
    ffprobeFor(ffmpegPath),
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      sourceFile,
    ],
    { cwd },
  );
  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration) || duration < 0)
    fail("song_guess_import_source_duration_unavailable");
  return duration;
}

function readAscii(buffer, offset, length) {
  return buffer.subarray(offset, offset + length).toString("ascii");
}

/** Ensure FFmpeg emitted a complete, exact 15-second PCM WAV without padding. */
export function validateExactWav(buffer) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 44 ||
    readAscii(buffer, 0, 4) !== "RIFF" ||
    readAscii(buffer, 8, 4) !== "WAVE"
  ) {
    return false;
  }
  let offset = 12;
  let fmt;
  let dataLength;
  while (offset + 8 <= buffer.length) {
    const chunk = readAscii(buffer, offset, 4);
    const length = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > buffer.length) return false;
    if (chunk === "fmt " && length >= 16) {
      fmt = {
        format: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bits: buffer.readUInt16LE(start + 14),
      };
    } else if (chunk === "data") {
      dataLength = length;
    }
    offset = start + length + (length % 2);
  }
  return Boolean(
    fmt &&
    fmt.format === 1 &&
    fmt.channels === CHANNELS &&
    fmt.sampleRate === SAMPLE_RATE &&
    fmt.bits === BITS_PER_SAMPLE &&
    dataLength === PCM_DATA_BYTES,
  );
}

async function extractSegment(sourceFile, outputFile, segmentStart, options) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await spawnProcess(
    options.spawnImpl,
    options.ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      sourceFile,
      "-ss",
      String(segmentStart),
      "-t",
      String(SEGMENT_DURATION_SECONDS),
      "-map_metadata",
      "-1",
      "-vn",
      "-ac",
      String(CHANNELS),
      "-ar",
      String(SAMPLE_RATE),
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      "-y",
      outputFile,
    ],
    { cwd: options.cwd },
  );
  const bytes = await fs.readFile(outputFile);
  if (!validateExactWav(bytes))
    fail("song_guess_import_output_not_exact_15_seconds");
}

function clipDeclaration(id, segment) {
  return { file: `clips/${id}/${segment}.wav` };
}

function mergedSongs(existing, imported) {
  const byId = new Map(existing.map((song) => [song.id, song]));
  for (const song of imported) {
    const prior = byId.get(song.id);
    if (prior && prior.sourceUrl !== song.sourceUrl)
      fail("song_guess_catalog_id_source_collision");
    byId.set(
      song.id,
      prior ? { ...song, clips: { ...prior.clips, ...song.clips } } : song,
    );
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function copyExistingSegments(prior, stageSongDir, clipsRoot) {
  if (!prior) return;
  for (const segment of SEGMENTS) {
    if (!prior.clips[segment] || typeof prior.clips[segment].file !== "string")
      continue;
    const source = outputClipPath(clipsRoot, prior.id, segment);
    try {
      await fs.copyFile(source, path.join(stageSongDir, `${segment}.wav`));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

async function commit({
  stageRoot,
  clipsRoot,
  catalogPath,
  songs,
  importedIds,
  tempCatalog,
}) {
  const backupRoot = path.join(stageRoot, "backup");
  const backupCatalog = path.join(stageRoot, "catalog.previous.json");
  const movedIds = [];
  let catalogBackedUp = false;
  try {
    await fs.mkdir(backupRoot, { recursive: true });
    for (const id of importedIds) {
      const destination = path.join(clipsRoot, id);
      try {
        await fs.rename(destination, path.join(backupRoot, id));
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    for (const id of importedIds) {
      await fs.rename(
        path.join(stageRoot, "songs", id),
        path.join(clipsRoot, id),
      );
      movedIds.push(id);
    }
    try {
      await fs.rename(catalogPath, backupCatalog);
      catalogBackedUp = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await fs.rename(tempCatalog, catalogPath);
    if (catalogBackedUp) await fs.rm(backupCatalog, { force: true });
    await fs.rm(backupRoot, { recursive: true, force: true });
  } catch (error) {
    await fs.rm(tempCatalog, { force: true }).catch(() => {});
    for (const id of movedIds)
      await fs
        .rm(path.join(clipsRoot, id), { recursive: true, force: true })
        .catch(() => {});
    for (const id of importedIds) {
      await fs
        .rename(path.join(backupRoot, id), path.join(clipsRoot, id))
        .catch(() => {});
    }
    if (catalogBackedUp)
      await fs.rename(backupCatalog, catalogPath).catch(() => {});
    throw error;
  }
}

/** Import local, rights-cleared audio into the checked-in pooled catalog. */
export async function importSongGuessCatalog(
  manifest,
  {
    ffmpegPath = "ffmpeg",
    catalogPath = DEFAULT_CATALOG,
    clipsRoot = DEFAULT_CLIPS_ROOT,
    spawnImpl = nodeSpawn,
    cwd = repoRoot,
    sourceBaseDir = process.cwd(),
  } = {},
) {
  const entries = normalizeImportManifest(manifest, { sourceBaseDir });
  const existing = await readExistingCatalog(catalogPath);
  const existingById = new Map(existing.map((song) => [song.id, song]));
  for (const entry of entries) {
    const prior = existingById.get(entry.id);
    if (prior && prior.sourceUrl !== entry.sourceUrl)
      fail("song_guess_catalog_id_source_collision");
  }
  const stageRoot = path.join(
    path.dirname(clipsRoot),
    `.song-guess-import-${process.pid}-${crypto.randomUUID()}`,
  );
  const imported = [];
  try {
    await fs.mkdir(path.join(stageRoot, "songs"), { recursive: true });
    for (const entry of entries) {
      const stat = await fs.stat(entry.sourceFile).catch(() => null);
      if (!stat?.isFile()) fail("song_guess_import_source_unavailable");
      const duration = await probeDuration(entry.sourceFile, {
        ffmpegPath,
        spawnImpl,
        cwd,
      });
      const stageSongDir = path.join(stageRoot, "songs", entry.id);
      await fs.mkdir(stageSongDir, { recursive: true });
      await copyExistingSegments(
        existingById.get(entry.id),
        stageSongDir,
        clipsRoot,
      );
      const clips = {};
      for (const [segment, start] of [
        ["intro", entry.introStartSeconds],
        ["highlight", entry.highlightStartSeconds],
      ]) {
        if (start === undefined) continue;
        if (duration < start + SEGMENT_DURATION_SECONDS)
          fail("song_guess_import_source_too_short");
        await extractSegment(
          entry.sourceFile,
          path.join(stageSongDir, `${segment}.wav`),
          start,
          {
            ffmpegPath,
            spawnImpl,
            cwd,
          },
        );
        clips[segment] = clipDeclaration(entry.id, segment);
      }
      const prior = existingById.get(entry.id);
      imported.push({
        id: entry.id,
        title: entry.title,
        artist: entry.artist,
        aliases: entry.aliases,
        categories: entry.categories,
        sourceUrl: entry.sourceUrl,
        clips: prior ? { ...prior.clips, ...clips } : clips,
      });
    }
    const songs = mergedSongs(existing, imported);
    await fs.mkdir(path.dirname(catalogPath), { recursive: true });
    const tempCatalog = path.join(stageRoot, "catalog.next.json");
    await fs.writeFile(
      tempCatalog,
      `${JSON.stringify({ version: 1, songs }, null, 2)}\n`,
      "utf8",
    );
    await fs.mkdir(clipsRoot, { recursive: true });
    await commit({
      stageRoot,
      clipsRoot,
      catalogPath,
      songs,
      importedIds: entries.map((entry) => entry.id),
      tempCatalog,
    });
    return { version: 1, songs, imported: entries.map((entry) => entry.id) };
  } catch (error) {
    await fs.rm(stageRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function parseArgs(argv) {
  const positional = [];
  let ffmpegPath = "ffmpeg";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--ffmpeg") {
      ffmpegPath = argv[++index];
      if (!ffmpegPath) fail("missing_ffmpeg_path");
    } else if (argument === "--help" || argument === "-h") {
      console.log(
        "Usage: node scripts/song-guess-import.mjs <manifest.json> [--ffmpeg <path>]",
      );
      process.exit(0);
    } else {
      positional.push(argument);
    }
  }
  if (positional.length !== 1) fail("usage_song_guess_import");
  return { manifestPath: path.resolve(positional[0]), ffmpegPath };
}

export async function main(argv = process.argv.slice(2)) {
  const { manifestPath, ffmpegPath } = parseArgs(argv);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const result = await importSongGuessCatalog(manifest, {
    ffmpegPath,
    sourceBaseDir: path.dirname(manifestPath),
  });
  console.log(
    JSON.stringify(
      { imported: result.imported, totalSongs: result.songs.length },
      null,
      2,
    ),
  );
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
