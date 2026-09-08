import { describe, expect, it } from "vitest";
import { buildSongGuessChoices } from "./choices";
import { normalizeSongGuessAnswer } from "./contracts";

const rounds = ["Blue Moon", "Red Sun", "White Sky", "Green Star", "Orange Light"].map((representativeAnswer, i) =>
  ({ id: `round-${i}`, representativeAnswer, aliases: [] as string[] }));

describe("server-authored song choices", () => {
  it("fills a single question from the full catalog while excluding answer aliases and duplicates", () => {
    const selected = [{ id: "one", representativeAnswer: "달리반피카소", aliases: ["Dali, Van, Picasso"] }];
    const catalog = [
      { title: "Dali, Van, Picasso", aliases: [] },
      { title: "동일 곡의 다른 표기", aliases: ["달리반피카소"] },
      ...["밤편지", "봄날", "좋은 날", " 봄날 "].map((title) => ({ title, aliases: [] })),
    ];
    const result = buildSongGuessChoices("request", selected, catalog);
    expect(result).toHaveLength(1);
    expect(result[0].map((choice) => choice.label).sort()).toEqual(["달리반피카소", "밤편지", "봄날", "좋은 날"].sort());
    expect(buildSongGuessChoices("request", selected, [...catalog].reverse())).toEqual(result);
  });

  it("creates four distinct opaque options with one correct answer, stable through create retries", () => {
    const result = buildSongGuessChoices("request", rounds);
    expect(buildSongGuessChoices("request", rounds)).toEqual(result);
    result.forEach((choices, index) => {
      expect(choices).toHaveLength(4);
      expect(new Set(choices.map((c) => c.id)).size).toBe(4);
      expect(new Set(choices.map((c) => normalizeSongGuessAnswer(c.label))).size).toBe(4);
      expect(choices.filter((c) => c.label === rounds[index].representativeAnswer)).toHaveLength(1);
      choices.forEach((c) => {
        expect(c.id).toMatch(/^[a-f0-9]{64}$/);
        expect(Object.keys(c).sort()).toEqual(["id", "label"]);
      });
    });
    expect(buildSongGuessChoices("another-request", rounds)).not.toEqual(result);
    expect(new Set(result.map((choices, i) => choices.findIndex((c) => c.label === rounds[i].representativeAnswer))).size).toBeGreaterThan(1);
  });

  it("rejects insufficient candidates including normalization duplicates and accepted aliases", () => {
    expect(() => buildSongGuessChoices("request", rounds.slice(0, 3))).toThrow("insufficient_song_guess_choices");
    expect(() => buildSongGuessChoices("request", [
      ...rounds.slice(0, 3), { id: "duplicate", representativeAnswer: " BLUE  MOON ", aliases: [] },
    ])).toThrow("insufficient_song_guess_choices");
    expect(() => buildSongGuessChoices("request", [
      { ...rounds[0], aliases: ["Red Sun"] }, ...rounds.slice(1, 4),
    ])).toThrow("insufficient_song_guess_choices");
  });
});
