import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const DEFAULT_SOURCE = path.join(
  repoRoot,
  ".codex",
  "artifacts",
  "song-guess-source",
  "song_kr.json",
);
const DEFAULT_CATALOG = path.join(
  repoRoot,
  "data",
  "song-guess",
  "catalog.json",
);

/**
 * Import track metadata and source offsets. A source URL alone is not a
 * playable clip; audio acquisition and private storage registration are separate.
 */
export async function importSongGuessYoutubeMetadata({
  sourcePath = DEFAULT_SOURCE,
  catalogPath = DEFAULT_CATALOG,
} = {}) {
  const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  if (!Array.isArray(source))
    throw new Error("invalid_song_guess_youtube_source");
  const prior = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  if (!prior || !Array.isArray(prior.songs))
    throw new Error("invalid_song_guess_catalog_manifest");
  const priorById = new Map(prior.songs.map((song) => [song.id, song]));
  const imported = source
    .filter(
      (row) =>
        typeof row?.code === "string" &&
        /^[A-Za-z0-9_-]{11}$/.test(row.code.trim()),
    )
    .map((row, index) => {
      const entry = normalizeSourceRow(row, index);
      const existing = priorById.get(entry.id);
      if (existing && existing.sourceUrl !== entry.sourceUrl) {
        throw new Error("song_guess_catalog_source_mismatch");
      }
      // Refreshing metadata must not discard downloaded or already stored audio.
      for (const [segment, clip] of Object.entries(existing?.clips ?? {})) {
        if (clip && typeof clip === "object" && ("file" in clip || "objectKey" in clip)) {
          entry.clips[segment] = clip;
        }
      }
      return entry;
    });
  const retained = prior.songs.filter(
    (song) => !String(song.id).startsWith("youtube-"),
  );
  const ids = new Set(retained.map((song) => song.id));
  for (const song of imported) {
    if (ids.has(song.id)) throw new Error("song_guess_catalog_id_collision");
    ids.add(song.id);
  }
  const songs = [...retained, ...imported];
  await fs.writeFile(
    catalogPath,
    `${JSON.stringify({ version: 1, songs }, null, 2)}\n`,
    "utf8",
  );
  return { version: 1, songs, imported: imported.map((song) => song.id) };
}

function normalizeSourceRow(row, index) {
  if (!row || typeof row !== "object")
    throw new Error("invalid_song_guess_youtube_row");
  const titleAndArtist = String(row.name ?? "").trim();
  const videoId = String(row.code ?? "").trim();
  const startSeconds = Number(row.start);
  if (!titleAndArtist || !videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error("invalid_song_guess_youtube_row");
  }
  if (
    !Number.isFinite(startSeconds) ||
    startSeconds < 0 ||
    startSeconds > 86_400
  ) {
    throw new Error("invalid_song_guess_youtube_start");
  }
  const separator = titleAndArtist.lastIndexOf(" - ");
  const title = (
    separator > 0 ? titleAndArtist.slice(0, separator) : titleAndArtist
  ).trim();
  const artist = (
    separator > 0 ? titleAndArtist.slice(separator + 3) : "알 수 없음"
  ).trim();
  if (!title || !artist) throw new Error("invalid_song_guess_youtube_row");
  const tags = Array.isArray(row.tags) ? row.tags.map(String) : [];
  const categories = categoriesFor(tags);
  const answers = Array.isArray(row.answer)
    ? row.answer.map((answer) => String(answer).trim()).filter(Boolean)
    : [];
  const aliases = [
    ...new Set(
      [...(answers.length ? answers : [title]), title].filter(
        (value) => value && value !== title,
      ),
    ),
  ];
  const clip = { videoId, startSeconds };
  const clips = { highlight: clip };
  // A source row beginning at zero has a verified opening segment. Rows with a
  // later offset remain highlight-only so the catalog never invents an intro.
  if (startSeconds === 0) clips.intro = clip;
  return {
    id: `youtube-${String(index + 1).padStart(3, "0")}`,
    title: title.slice(0, 200),
    artist: artist.slice(0, 200),
    aliases: aliases.slice(0, 20).map((value) => value.slice(0, 200)),
    categories,
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    sourceMetadata: { videoId, startSeconds, tags },
    clips,
  };
}

function categoriesFor(tags) {
  const categories = [];
  if (tags.includes("여자 아이돌") || tags.includes("걸그룹"))
    categories.push("girl-idol");
  if (tags.includes("남자 아이돌")) categories.push("boy-idol");
  const years = tags.filter((tag) => /^20\d{2}$/.test(tag)).map(Number);
  if (years.some((year) => year >= 2000 && year <= 2009))
    categories.push("2000s");
  if (years.some((year) => year >= 2010 && year <= 2019))
    categories.push("2010s");
  if (years.some((year) => year >= 2020 && year <= 2029))
    categories.push("2020s");
  if (categories.length === 0) categories.push("other");
  return categories;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const [sourcePath, catalogPath] = process.argv.slice(2);
  importSongGuessYoutubeMetadata({
    sourcePath: sourcePath ? path.resolve(sourcePath) : DEFAULT_SOURCE,
    catalogPath: catalogPath ? path.resolve(catalogPath) : DEFAULT_CATALOG,
  })
    .then((result) =>
      console.log(
        JSON.stringify(
          { imported: result.imported.length, totalSongs: result.songs.length },
          null,
          2,
        ),
      ),
    )
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
