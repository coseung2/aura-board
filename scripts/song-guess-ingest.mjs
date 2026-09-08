import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { importSongGuessCatalog, normalizeImportManifest } from "./song-guess-import.mjs";
import { validateProvenance } from "./song-guess-provenance.mjs";

const runFile = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensions = new Set([".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".aiff", ".wma"]);
export const clean = (value) => typeof value === "string"
  ? value.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim() : "";
const key = (value) => clean(value).toLowerCase();
const unique = (values) => [...new Map(values.map(clean).filter(Boolean).map((v) => [key(v), v])).values()];

/** Explicit metadata wins over embedded tags, then filename. Never guess an artist's group/gender. */
export function normalizeRecording({ file, sha256, probe, metadata = {}, artistCategories = {} }) {
  const tags = Object.fromEntries(Object.entries({
    ...probe.streams?.find((stream) => stream.codec_type === "audio")?.tags,
    ...probe.format?.tags,
  }).map(([k, v]) => [k.toLowerCase(), v]));
  const stem = clean(path.basename(file, path.extname(file))).replace(/^\d+[._ -]+/, "");
  const separator = stem.indexOf(" - ");
  const performer = clean(metadata.performer ?? metadata.artist ?? tags.artist ?? (separator >= 0 ? stem.slice(0, separator) : ""));
  const composer = clean(metadata.composer ?? tags.composer);
  const title = clean(metadata.title ?? tags.title ?? (separator >= 0 ? stem.slice(separator + 3) : stem));
  const genre = clean(metadata.genre ?? tags.genre);
  const date = String(metadata.year ?? tags.date ?? tags.year ?? "");
  const year = /^\d{4}(?:$|[-/])/.test(date) ? Number(date.slice(0, 4)) : null;
  const mapped = Object.entries(artistCategories).find(([artist]) => key(artist) === key(performer))?.[1] ?? [];
  if (!Array.isArray(mapped) || (metadata.categories !== undefined && !Array.isArray(metadata.categories))) throw new Error("invalid_categories");
  const classical = /classical|클래식/i.test(genre) || metadata.categories?.includes("classical");
  const automatic = [...mapped, ...(classical ? ["classical"] : []),
    ...(year >= 2000 && year < 2030 ? [`${Math.floor(year / 10) * 10}s`] : [])];
  const categories = unique(metadata.categories ?? (automatic.length ? automatic : ["other"]));
  const artist = clean(metadata.answerArtist ?? (classical ? composer || performer : performer || composer));
  if (metadata.aliases !== undefined && !Array.isArray(metadata.aliases)) throw new Error("invalid_aliases");
  const aliases = unique(metadata.aliases ?? []).filter((alias) => key(alias) !== key(title));
  const sourceUrl = clean(metadata.sourceUrl ?? tags.sourceurl ?? tags.website ?? tags.purl);
  const entry = {
    id: metadata.id ?? `audio-${sha256.slice(0, 32)}`, title, artist, aliases, categories,
    sourceFile: path.resolve(file), sourceUrl,
    introStartSeconds: metadata.introStartSeconds ?? 0,
    ...(metadata.highlightStartSeconds !== undefined ? { highlightStartSeconds: metadata.highlightStartSeconds } : {}),
    sourceMetadata: {
      provenance: validateProvenance(metadata.provenance ?? {
        version: 1, container: "unknown", content: "unknown",
        trackStartSeconds: null, trackEndSeconds: null,
        quizStartSeconds: metadata.highlightStartSeconds ?? null,
        selectionStatus: metadata.highlightStartSeconds != null ? "teacher-selected" : "unknown",
      }),
      ingestionVersion: 1, sourceSha256: sha256, originalFilename: path.basename(file),
      performer, composer, genre, year, normalizedTitle: key(title), normalizedArtist: key(artist),
      durationSeconds: Number(probe.format?.duration),
    },
  };
  const issues = [];
  if (!title) issues.push("제목 필요");
  if (!artist) issues.push("가수 또는 작곡가 필요");
  if (!sourceUrl) issues.push("출처 URL 필요");
  const duration = Number(probe.format?.duration);
  if (!Number.isFinite(duration) || duration < 15) issues.push("15초 이상 음원 필요");
  for (const start of [entry.introStartSeconds, entry.highlightStartSeconds]) {
    if (start !== undefined && (typeof start !== "number" || !Number.isFinite(start) || start < 0 || start + 15 > duration)) issues.push("재생 구간 확인 필요");
  }
  try { normalizeImportManifest([entry]); } catch (error) { issues.push(error.message); }
  return { entry, issues: unique(issues), warnings: categories.includes("other") ? ["분류 정보 없음: 기타로 분류"] : [] };
}

async function* audioFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* audioFiles(file);
    else if (entry.isFile() && extensions.has(path.extname(file).toLowerCase())) yield file;
  }
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

export async function planIngestion(directory, { ffprobe = "ffprobe", artistCategories = {}, probeFile } = {}) {
  const ready = [], review = [], duplicates = [], warnings = [];
  const hashes = new Map(), ids = new Map();
  for await (const file of audioFiles(path.resolve(directory))) {
    try {
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      const sha256 = hash.digest("hex");
      const metadata = await readJson(`${file}.json`, {});
      const probe = probeFile ? await probeFile(file) : JSON.parse((await runFile(ffprobe, [
        "-v", "error", "-show_format", "-show_streams", "-of", "json", file,
      ], { windowsHide: true, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 })).stdout);
      const result = normalizeRecording({ file, sha256, probe, metadata, artistCategories });
      if (result.issues.length) { review.push({ file, issues: result.issues }); continue; }
      // Duplicate bytes may carry conflicting sidecars: require review instead of silently choosing one.
      const signature = JSON.stringify({ ...result.entry, sourceFile: undefined,
        sourceMetadata: { ...result.entry.sourceMetadata, originalFilename: undefined } });
      if (hashes.has(sha256)) {
        if (hashes.get(sha256).signature !== signature) review.push({ file, issues: ["동일 음원의 메타데이터 충돌"] });
        else duplicates.push({ file, original: hashes.get(sha256).file });
        continue;
      }
      if (ids.has(result.entry.id)) { review.push({ file, issues: ["서로 다른 음원의 ID 중복"] }); continue; }
      hashes.set(sha256, { file, signature }); ids.set(result.entry.id, file);
      ready.push(result.entry);
      if (result.warnings.length) warnings.push({ file, messages: result.warnings });
    } catch (error) {
      review.push({ file, issues: [error.code === "ENOENT" ? "파일 또는 ffprobe를 찾을 수 없음" : "메타데이터/음원 읽기 실패"] });
    }
  }
  return { version: 1, ready, review, duplicates, warnings };
}

export async function main(argv = process.argv.slice(2)) {
  const options = {}, positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (["--apply", "--register", "--help"].includes(arg)) options[arg] = true;
    else if (["--ffmpeg", "--ffprobe", "--output", "--artist-map"].includes(arg)) {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`missing_value:${arg}`);
      options[arg] = argv[++i];
    } else if (arg.startsWith("--")) throw new Error(`unknown_option:${arg}`);
    else positional.push(arg);
  }
  if (options["--help"]) {
    console.log("Usage: npm run song-guess:ingest -- <audio-folder> [--apply [--register]] [--output <directory>] [--artist-map <json>] [--ffmpeg <path>] [--ffprobe <path>]"); return;
  }
  if (positional.length !== 1) throw new Error("음악 폴더 하나를 지정하세요. --help 참고");
  if (options["--register"] && !options["--apply"]) throw new Error("--register requires --apply");
  const directory = path.resolve(positional[0]);
  const output = path.resolve(options["--output"] ?? path.join(root, ".codex/artifacts/song-guess-ingest"));
  const relative = path.relative(directory, output);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) throw new Error("출력 폴더는 입력 음악 폴더 밖에 두세요.");
  const ffmpegPath = options["--ffmpeg"] ?? "ffmpeg";
  const ffprobe = options["--ffprobe"] ?? (path.isAbsolute(ffmpegPath)
    ? path.join(path.dirname(ffmpegPath), `ffprobe${path.extname(ffmpegPath)}`) : "ffprobe");
  const plan = await planIngestion(directory, { ffprobe,
    artistCategories: options["--artist-map"] ? JSON.parse(await fs.readFile(options["--artist-map"], "utf8")) : {},
  });
  console.log(JSON.stringify(plan, null, 2));
  if (!options["--apply"]) return plan;
  if (plan.review.length || !plan.ready.length) throw new Error("검토 항목을 수정하고 다시 실행하세요. 등록하지 않았습니다.");
  const catalogPath = path.join(output, "catalog.json");
  const imported = await importSongGuessCatalog(plan.ready, { catalogPath, clipsRoot: path.join(output, "clips"), ffmpegPath, ffprobePath: ffprobe });
  // Only sync this invocation's songs; unrelated entries in the output catalog are untouched.
  const batchPath = path.join(output, "batch.json");
  const ids = new Set(imported.imported);
  await fs.writeFile(batchPath, JSON.stringify({ version: 1, songs: imported.songs.filter((song) => ids.has(song.id)) }, null, 2) + "\n");
  if (options["--register"]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx",
        path.join(root, "scripts/song-guess-catalog-sync.ts"), batchPath, "--apply"],
      { cwd: root, stdio: "inherit", windowsHide: true });
      child.on("error", reject);
      child.on("exit", (code) => code === 0 ? resolve() : reject(new Error("DB 등록 실패: 같은 명령으로 재시도할 수 있습니다.")));
    });
  }
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
