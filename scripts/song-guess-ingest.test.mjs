import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeRecording, planIngestion, main } from "./song-guess-ingest.mjs";

const probe = { format: { duration: "60", tags: { title: "Ｔｉｔｌｅ", artist: " Artist  ", date: "2024-05-01", purl: "https://example.test/source" } } };
const normalize = (extra = {}) => normalizeRecording({ file: "wrong - filename.mp3", sha256: "a".repeat(64), probe, ...extra });

test("normalizes tags, aliases and decade; explicit metadata wins", () => {
  const { entry, issues } = normalize({ metadata: { aliases: [" title ", "별명", " 별명 "] } });
  assert.deepEqual(issues, []);
  assert.equal(entry.title, "Title"); assert.equal(entry.artist, "Artist");
  assert.deepEqual(entry.aliases, ["별명"]); assert.deepEqual(entry.categories, ["2020s"]);
  assert.equal(normalize({ metadata: { title: "수정" } }).entry.title, "수정");
});

test("keeps performer and composer separate and uses composer for classical", () => {
  const { entry } = normalize({ metadata: { genre: "Classical", composer: " Bach ", performer: "Pianist" } });
  assert.equal(entry.artist, "Bach"); assert.equal(entry.sourceMetadata.performer, "Pianist");
  assert.equal(entry.sourceMetadata.composer, "Bach"); assert.ok(entry.categories.includes("classical"));
});

test("filename fallback and configured artist classification do not invent missing metadata", () => {
  const result = normalize({ file: "01. 가수 - 노래.wav", probe: { format: { duration: 30 } },
    artistCategories: { "가수": ["girl-idol"] } });
  assert.equal(result.entry.title, "노래"); assert.equal(result.entry.artist, "가수");
  assert.deepEqual(result.entry.categories, ["girl-idol"]);
  assert.ok(result.issues.includes("출처 URL 필요"));
  assert.deepEqual(normalize({ metadata: { categories: ["other"] } }).entry.categories, ["other"]);
});

test("rejects short audio, invalid segments, source URLs and IDs before import", () => {
  assert.ok(normalize({ probe: { format: { duration: 14 } } }).issues.length);
  for (const metadata of [{ highlightStartSeconds: 50 }, { sourceUrl: "file:///secret" }, { id: "../escape" }, { categories: ["unknown"] }]) {
    assert.ok(normalize({ metadata }).issues.length);
  }
});

test("recursive planning is read only, deduplicates bytes and flags conflicting sidecars", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "song-ingest-"));
  try {
    await fs.mkdir(path.join(directory, "nested"));
    await fs.writeFile(path.join(directory, "one.mp3"), "same audio");
    await fs.writeFile(path.join(directory, "nested", "two.mp3"), "same audio");
    let plan = await planIngestion(directory, { probeFile: async () => probe });
    assert.equal(plan.ready.length, 1); assert.equal(plan.duplicates.length, 1);
    assert.equal(plan.review.length, 0);
    const id = plan.ready[0].id;
    await fs.writeFile(path.join(directory, "one.mp3.json"), JSON.stringify({ title: "Different" }));
    plan = await planIngestion(directory, { probeFile: async () => probe });
    assert.equal(plan.review.length, 1); assert.equal(plan.ready[0].id, id);
    assert.deepEqual((await fs.readdir(directory)).sort(), ["nested", "one.mp3", "one.mp3.json"]);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("CLI requires explicit apply for registration and rejects output inside input", async () => {
  await assert.rejects(main(["audio", "--register"]), /requires --apply/);
  await assert.rejects(main(["audio", "--output", "audio/generated"]), /출력 폴더/);
  await assert.rejects(main(["audio", "--typo"]), /unknown_option/);
});
