import { describe, expect, it } from "vitest";
import {
  answersMatch,
  computeScore,
  normalizeKeyword,
  rankCorrectAnswers,
} from "./score";

describe("speed game scoring", () => {
  it("normalizes case, whitespace, and zero-width characters on the server", () => {
    expect(normalizeKeyword(" C\u200Ba T ")).toBe("cat");
    expect(answersMatch("cat", " C a T ")).toBe(true);
  });

  it("derives score from server elapsed time, configured floor, and rank bonus", () => {
    expect(
      computeScore({
        correct: true,
        elapsedMs: 2_000,
        rank: 1,
        bonusRanks: [300, 200, 100],
        baseScore: 1_000,
        minScore: 0,
      }),
    ).toBe(1_200);
    expect(
      computeScore({
        correct: true,
        elapsedMs: 1_000_000,
        rank: 4,
        bonusRanks: [300, 200, 100],
        baseScore: 1_000,
        minScore: 50,
      }),
    ).toBe(50);
  });

  it("never awards points to an incorrect answer", () => {
    expect(
      computeScore({
        correct: false,
        elapsedMs: 0,
        rank: 1,
        bonusRanks: [300],
      }),
    ).toBe(0);
  });

  it("uses answer id as a deterministic tie-break for equal timestamps", () => {
    const createdAt = new Date("2026-08-02T00:00:00.000Z");
    const ranks = rankCorrectAnswers([
      { answerId: "b", correct: true, createdAt },
      { answerId: "a", correct: true, createdAt },
      { answerId: "wrong", correct: false, createdAt },
    ]);
    expect(ranks.get("a")?.rank).toBe(1);
    expect(ranks.get("b")?.rank).toBe(2);
    expect(ranks.has("wrong")).toBe(false);
  });
});
