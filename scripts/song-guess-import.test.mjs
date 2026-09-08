import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { spawn as nodeSpawn, spawnSync } from "node:child_process";
import { afterEach, test } from "node:test";

import {
  PCM_DATA_BYTES,
  importSongGuessCatalog,
  normalizeImportManifest,
  validateExactWav,
} from "./song-guess-import.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

function pcmWav(dataLength = PCM_DATA_BYTES) {
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVEfmt ", 8, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(44_100, 24);
  buffer.writeUInt32LE(88_200, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}

async function temporaryFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "song-guess-import-"));
  temporaryDirectories.push(root);
  const sourceFile = path.join(root, "source.wav");
  await fs.writeFile(sourceFile, "authorized local source placeholder");
  return {
    root,
    sourceFile,
    catalogPath: path.join(root, "data", "song-guess", "catalog.json"),
    clipsRoot: path.join(root, "data", "song-guess", "clips"),
  };
}

function fakeSpawn({ duration = 60, exact = true } = {}) {
  return (command, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(async () => {
      if (String(command).includes("ffprobe")) {
        child.stdout.emit("data", Buffer.from(`${duration}\n`));
      } else {
        const output = args.at(-1);
        await fs.writeFile(
          output,
          pcmWav(exact ? PCM_DATA_BYTES : PCM_DATA_BYTES - 2),
        );
      }
      child.emit("close", 0);
    });
    return child;
  };
}

function input(sourceFile, overrides = {}) {
  return [
    {
      id: "song-one",
      title: "Song One",
      artist: "Artist",
      aliases: ["Song 1"],
      categories: ["classical"],
      sourceFile,
      sourceUrl: "https://example.test/song-one",
      introStartSeconds: 0,
      highlightStartSeconds: 20,
      ...overrides,
    },
  ];
}

test("validates exact mono 44.1 kHz 16-bit fifteen-second WAV output", () => {
  assert.equal(validateExactWav(pcmWav()), true);
  assert.equal(validateExactWav(pcmWav(PCM_DATA_BYTES - 2)), false);
});

test("preserves creator provenance and all runtime categories across repeated imports", async () => {
  const fixture = await temporaryFixture();
  const options = { catalogPath: fixture.catalogPath, clipsRoot: fixture.clipsRoot, spawnImpl: fakeSpawn() };
  await importSongGuessCatalog(input(fixture.sourceFile, {
    categories: ["2020s", "other"], sourceMetadata: { composer: "Composer", sourceSha256: "abc" },
  }), options);
  const second = await importSongGuessCatalog(input(fixture.sourceFile, { categories: ["2020s"] }), options);
  assert.equal(second.songs[0].sourceMetadata.composer, "Composer");
  assert.equal(second.songs[0].sourceMetadata.sourceSha256, "abc");
});

test("imports both segments atomically and preserves existing catalog songs", async () => {
  const fixture = await temporaryFixture();
  await fs.mkdir(path.dirname(fixture.catalogPath), { recursive: true });
  await fs.writeFile(
    fixture.catalogPath,
    JSON.stringify({
      version: 1,
      songs: [
        {
          id: "existing",
          title: "Existing",
          artist: "Artist",
          aliases: [],
          categories: ["2000s"],
          sourceUrl: "https://example.test/existing",
          clips: { intro: { file: "clips/existing/intro.wav" } },
        },
      ],
    }),
  );
  const result = await importSongGuessCatalog(input(fixture.sourceFile), {
    catalogPath: fixture.catalogPath,
    clipsRoot: fixture.clipsRoot,
    spawnImpl: fakeSpawn(),
  });
  assert.deepEqual(result.imported, ["song-one"]);
  const catalog = JSON.parse(await fs.readFile(fixture.catalogPath, "utf8"));
  assert.deepEqual(
    catalog.songs.map((song) => song.id),
    ["existing", "song-one"],
  );
  assert.equal(
    catalog.songs[1].clips.highlight.file,
    "clips/song-one/highlight.wav",
  );
  assert.equal(
    (
      await fs.stat(path.join(fixture.clipsRoot, "song-one", "intro.wav"))
    ).isFile(),
    true,
  );
});

test("rejects a too-short source before extraction and cleans staged output", async () => {
  const fixture = await temporaryFixture();
  await assert.rejects(
    importSongGuessCatalog(
      input(fixture.sourceFile, { highlightStartSeconds: 50 }),
      {
        catalogPath: fixture.catalogPath,
        clipsRoot: fixture.clipsRoot,
        spawnImpl: fakeSpawn({ duration: 60 }),
      },
    ),
    /source_too_short/,
  );
  assert.equal(
    await fs
      .access(fixture.catalogPath)
      .then(() => true)
      .catch(() => false),
    false,
  );
  assert.equal(
    await fs
      .readdir(fixture.clipsRoot)
      .then((items) => items.length)
      .catch(() => 0),
    0,
  );
});

test("rejects non-exact FFmpeg output without changing the existing manifest", async () => {
  const fixture = await temporaryFixture();
  await fs.mkdir(path.dirname(fixture.catalogPath), { recursive: true });
  const original = { version: 1, songs: [] };
  await fs.writeFile(fixture.catalogPath, JSON.stringify(original));
  await assert.rejects(
    importSongGuessCatalog(input(fixture.sourceFile), {
      catalogPath: fixture.catalogPath,
      clipsRoot: fixture.clipsRoot,
      spawnImpl: fakeSpawn({ exact: false }),
    }),
    /output_not_exact_15_seconds/,
  );
  assert.deepEqual(
    JSON.parse(await fs.readFile(fixture.catalogPath, "utf8")),
    original,
  );
  assert.equal(
    await fs
      .readdir(fixture.clipsRoot)
      .then((items) => items.length)
      .catch(() => 0),
    0,
  );
});

test("rejects duplicate IDs and source URL collisions", async () => {
  const fixture = await temporaryFixture();
  assert.throws(
    () =>
      normalizeImportManifest([
        ...input(fixture.sourceFile),
        ...input(fixture.sourceFile),
      ]),
    /duplicate_id/,
  );
  await fs.mkdir(path.dirname(fixture.catalogPath), { recursive: true });
  await fs.writeFile(
    fixture.catalogPath,
    JSON.stringify({
      version: 1,
      songs: [
        {
          id: "song-one",
          title: "Old",
          artist: "Artist",
          aliases: [],
          categories: ["classical"],
          sourceUrl: "https://example.test/different-source",
          clips: { intro: { file: "clips/song-one/intro.wav" } },
        },
      ],
    }),
  );
  await assert.rejects(
    importSongGuessCatalog(input(fixture.sourceFile), {
      catalogPath: fixture.catalogPath,
      clipsRoot: fixture.clipsRoot,
      spawnImpl: fakeSpawn(),
    }),
    /id_source_collision/,
  );
});

test("accepts Windows drive paths but rejects remote source URLs", async () => {
  const fixture = await temporaryFixture();
  const windowsPath = fixture.sourceFile.replace(/^([A-Za-z]):[\\/]/, "$1:\\");
  assert.equal(
    normalizeImportManifest(input(windowsPath))[0].sourceFile,
    path.resolve(windowsPath),
  );
  assert.throws(
    () => normalizeImportManifest(input("https://example.test/source.wav")),
    /source_must_be_local/,
  );
  assert.throws(
    () => normalizeImportManifest(input("file:///C:/source.wav")),
    /source_must_be_local/,
  );
});

test("preserves existing YouTube clips while adding local segments", async () => {
  const fixture = await temporaryFixture();
  await fs.mkdir(path.dirname(fixture.catalogPath), { recursive: true });
  await fs.writeFile(
    fixture.catalogPath,
    JSON.stringify({
      version: 1,
      songs: [
        {
          id: "song-one",
          title: "Song One",
          artist: "Artist",
          aliases: [],
          categories: ["classical"],
          sourceUrl: "https://example.test/song-one",
          clips: { highlight: { videoId: "dQw4w9WgXcQ", startSeconds: 12 } },
        },
      ],
    }),
  );
  const result = await importSongGuessCatalog(
    input(fixture.sourceFile, {
      id: "song-one",
      introStartSeconds: 0,
      highlightStartSeconds: undefined,
    }),
    {
      catalogPath: fixture.catalogPath,
      clipsRoot: fixture.clipsRoot,
      spawnImpl: fakeSpawn(),
    },
  );
  const song = result.songs.find((candidate) => candidate.id === "song-one");
  assert.deepEqual(song?.clips.highlight, {
    videoId: "dQw4w9WgXcQ",
    startSeconds: 12,
  });
  assert.deepEqual(song?.clips.intro, { file: "clips/song-one/intro.wav" });
  assert.equal(
    (
      await fs.stat(path.join(fixture.clipsRoot, "song-one", "intro.wav"))
    ).isFile(),
    true,
  );
});

test("preserves an existing local segment when importing only the other segment", async () => {
  const fixture = await temporaryFixture();
  const options = {
    catalogPath: fixture.catalogPath,
    clipsRoot: fixture.clipsRoot,
    spawnImpl: fakeSpawn(),
  };
  await importSongGuessCatalog(input(fixture.sourceFile), options);
  const priorHighlight = await fs.readFile(
    path.join(fixture.clipsRoot, "song-one", "highlight.wav"),
  );
  await importSongGuessCatalog(
    input(fixture.sourceFile, { highlightStartSeconds: undefined }),
    options,
  );
  assert.deepEqual(
    await fs.readFile(
      path.join(fixture.clipsRoot, "song-one", "highlight.wav"),
    ),
    priorHighlight,
  );
  const catalog = JSON.parse(await fs.readFile(fixture.catalogPath, "utf8"));
  assert.deepEqual(catalog.songs.find((song) => song.id === "song-one").clips, {
    intro: { file: "clips/song-one/intro.wav" },
    highlight: { file: "clips/song-one/highlight.wav" },
  });
});

const hasFfmpeg =
  spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
test(
  "extracts a real fifteen-second clip when FFmpeg is available",
  { skip: !hasFfmpeg },
  async () => {
    const fixture = await temporaryFixture();
    const source = path.join(fixture.root, "tone.wav");
    const generated = spawnSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=44100",
      "-t",
      "16",
      "-ac",
      "1",
      "-ar",
      "44100",
      "-c:a",
      "pcm_s16le",
      "-y",
      source,
    ]);
    assert.equal(generated.status, 0, generated.stderr?.toString());
    await importSongGuessCatalog(
      input(source, { highlightStartSeconds: undefined }),
      {
        catalogPath: fixture.catalogPath,
        clipsRoot: fixture.clipsRoot,
        spawnImpl: nodeSpawn,
      },
    );
    assert.equal(
      validateExactWav(
        await fs.readFile(
          path.join(fixture.clipsRoot, "song-one", "intro.wav"),
        ),
      ),
      true,
    );
  },
);
