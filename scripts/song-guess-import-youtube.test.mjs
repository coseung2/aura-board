import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { importSongGuessYoutubeMetadata } from "./song-guess-import-youtube.mjs";

test("metadata refresh assigns explicit decades, preserves acquired audio and classical songs", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "song-metadata-"));
  try {
    const sourcePath = path.join(directory, "source.json");
    const catalogPath = path.join(directory, "catalog.json");
    const source = [
      { name: "새 노래 - 가수", code: "abcdefghijk", start: 30, tags: ["2021"], answer: ["새 노래"] },
      { name: "지난 노래 - 가수", code: "lmnopqrstuv", start: 0, tags: ["2014", "걸그룹"], answer: [] },
      { name: "연도 미상 - 가수", code: "wxyz1234567", start: 0, tags: [], answer: [] },
    ];
    const prior = { version: 1, songs: [
      { id: "classic", title: "클래식", categories: ["classical"], clips: { highlight: { file: "classic.wav" } } },
      { id: "youtube-001", sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk", clips: { highlight: { file: "clips/youtube-001/highlight.wav" } } },
    ] };
    await writeFile(sourcePath, JSON.stringify(source));
    await writeFile(catalogPath, JSON.stringify(prior));
    const first = await importSongGuessYoutubeMetadata({ sourcePath, catalogPath });
    assert.deepEqual(first.songs[0], prior.songs[0]);
    assert.deepEqual(first.songs[1].categories, ["2020s"]);
    assert.deepEqual(first.songs[1].clips, prior.songs[1].clips);
    assert.equal(first.songs[1].sourceMetadata.startSeconds, 30);
    assert.deepEqual(first.songs[2].categories, ["girl-idol", "2010s"]);
    assert.deepEqual(first.songs[3].categories, ["other"]);
    const second = await importSongGuessYoutubeMetadata({ sourcePath, catalogPath });
    assert.deepEqual(second.songs, first.songs);
    source[0].code = "987654321ab";
    await writeFile(sourcePath, JSON.stringify(source));
    const before = await readFile(catalogPath, "utf8");
    await assert.rejects(importSongGuessYoutubeMetadata({ sourcePath, catalogPath }), /source_mismatch/);
    assert.equal(await readFile(catalogPath, "utf8"), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
