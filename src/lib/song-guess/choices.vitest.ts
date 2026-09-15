import { describe, expect, it } from "vitest";
import { buildSongGuessChoices, resolveChoiceCategories } from "./choices";
import { normalizeSongGuessAnswer } from "./contracts";

const rounds = ["Blue Moon", "Red Sun", "White Sky", "Green Star", "Orange Light"].map((representativeAnswer, i) =>
  ({ id: `round-${i}`, representativeAnswer, aliases: [] as string[] }));

describe("server-authored song choices", () => {
  it("fills a single question from its category while excluding answer aliases and duplicates", () => {
    const selected = [{ id: "one", representativeAnswer: "달리반피카소", aliases: ["Dali, Van, Picasso"], categories: ["2010s"] }];
    const catalog = [
      { title: "Dali, Van, Picasso", aliases: [] },
      { title: "동일 곡의 다른 표기", aliases: ["달리반피카소"] },
      ...["밤편지", "봄날", "좋은 날", " 봄날 "].map((title) => ({ title, aliases: [] })),
    ].map((song) => ({ ...song, categories: ["2010s"] }));
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

  it("never fills a classical question with unrelated songs sharing only a decade", () => {
    const selected = [{ id: "one", representativeAnswer: "소나타", aliases: [], categories: ["classical", "2020s"] }];
    const catalog = [
      ...["교향곡", "협주곡", "왈츠"].map((title) => ({ title, aliases: [], categories: ["classical"] })),
      ...["팝 1", "팝 2", "팝 3"].map((title) => ({ title, aliases: [], categories: ["2020s"] })),
    ];
    const choices = buildSongGuessChoices("seed", selected, catalog)[0];
    expect(choices.map((c) => c.label).sort()).toEqual(["소나타", "교향곡", "협주곡", "왈츠"].sort());
    expect(() => buildSongGuessChoices("seed", selected, catalog.slice(2))).toThrow("insufficient_song_guess_choices");
  });

  it("does not silently substitute catalog choices for a manual question with unknown provenance", () => {
    expect(() => buildSongGuessChoices("seed", rounds.slice(0, 1), rounds.slice(1).map((r) => ({ title: r.representativeAnswer, aliases: r.aliases })))).toThrow("insufficient_song_guess_choices");
  });

  it("preserves source identity through renamed answers and rejects ambiguous legacy matches", () => {
    const catalog = [
      { id: "a", title: "Same", artist: "One", aliases: [], categories: ["classical"] },
      { id: "b", title: "Same", artist: "Two", aliases: [], categories: ["girl-idol"] },
    ];
    expect(resolveChoiceCategories({ sourceCatalogSongId: "a", representativeAnswer: "수정한 제목" }, catalog)).toEqual(["classical"]);
    expect(resolveChoiceCategories({ representativeAnswer: "Same" }, catalog)).toBeUndefined();
    expect(resolveChoiceCategories({ representativeAnswer: "Same", artist: "Two" }, catalog)).toEqual(["girl-idol"]);
  });
});
