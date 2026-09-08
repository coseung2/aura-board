import { describe, expect, it } from "vitest";
import { parseSongGuessImportLink } from "./import-link";

const id = "dQw4w9WgXcQ";
const watch = `https://www.youtube.com/watch?v=${id}`;

describe("parseSongGuessImportLink", () => {
  it.each([
    [`${watch}&t=0`, 0], [`${watch}&start=15`, 15],
    [`${watch}#t=1h2m3s`, 3723], [`https://youtube.com/watch?v=${id}&t=1m`, 60],
    [`https://m.youtube.com/watch?v=${id}&t=90s`, 90],
    [`https://youtu.be/${id}?t=24h`, 86400], [`${watch}&t=86400`, 86400],
    [`https://youtu.be/${id}?si=tracking&start=0002`, 2],
    [`  ${watch}&list=ignored&t=2m3s  `, 123], [`${watch}&t=0h0m0s`, 0],
    [`${watch}&%74=12`, 12],
  ])("canonicalizes %s", (input, startSeconds) => {
    expect(parseSongGuessImportLink(input)).toEqual({ videoId: id, startSeconds,
      sourceUrl: `${watch}&t=${startSeconds}` });
  });

  it.each([
    watch, `${watch}&t=`, `${watch}&t`, `${watch}&t=-1`, `${watch}&t=+1`,
    `${watch}&t=1.5`, `${watch}&t=1e2`, `${watch}&t=0x10`, `${watch}&t=NaN`,
    `${watch}&t=Infinity`, `${watch}&t=1:20`, `${watch}&t=1m2h`, `${watch}&t=1s2s`,
    `${watch}&t=1H`, `${watch}&t=h`, `${watch}&t=1m2`, `${watch}&t=86401`,
    `${watch}&t=25h`, `${watch}&t=${"9".repeat(400)}`, `${watch}&t=1%00`,
    `${watch}&t=1&t=1`, `${watch}&t=1&start=1`, `${watch}&start=1&start=2`,
    `${watch}&t=1#t=1`, `${watch}#t=1&t=1`, `${watch}#start=1`,
    `${watch}#t=1&extra=2`, `${watch}&t=1#other`, `${watch}&t=1&%74=2`,
    `${watch}&v=${id}&t=1`, `${watch.replace(id, "unknown")}&t=1`,
    `${watch.replace(id, "a".repeat(12))}&t=1`, `${watch.replace(id, "a.bbbbbbbbb")}&t=1`,
    `https://youtu.be/${id}/extra?t=1`, `https://youtu.be/${id}?v=${id}&t=1`,
    `https://www.youtube.com/shorts/${id}?t=1`, `https://www.youtube.com/embed/${id}?t=1`,
    `https://www.youtube.com/a/../watch?v=${id}&t=1`,
    `https://www.youtube.com/%2e/watch?v=${id}&t=1`,
    `${watch.replace("https:", "http:")}&t=1`, `${watch.replace("www.youtube.com", "evil.com")}&t=1`,
    `${watch.replace("www.youtube.com", "www.youtube.com.evil.com")}&t=1`,
    `${watch.replace("www.youtube.com", "user:pass@www.youtube.com")}&t=1`,
    `${watch.replace("www.youtube.com", "www.youtube.com:443")}&t=1`,
    `${watch.replace("www.youtube.com", "www.youtube.com:8443")}&t=1`,
    `${watch.replace("www.youtube.com", "%77ww.youtube.com")}&t=1`,
    `${watch.replace("www.youtube.com", "www.youtube.com.")}&t=1`,
    `${watch.replace("/watch", "\\watch")}&t=1`, `${watch}&t=1\n2`,
    `${watch}&t=%`, `${watch}&t=%FF`, `${watch}&t=１`, "", "https://", "x".repeat(4097),
  ])("rejects adversarial input %s", (input) => {
    expect(() => parseSongGuessImportLink(input)).toThrowError("invalid_song_guess_import_link");
  });

  it("rejects non-string runtime values with the stable error", () => {
    expect(() => parseSongGuessImportLink(null as unknown as string)).toThrowError("invalid_song_guess_import_link");
  });
});
