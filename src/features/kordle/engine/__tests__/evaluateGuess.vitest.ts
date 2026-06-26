import { describe, expect, it } from "vitest";
import { evaluateGuess, normalizeWord, recomposeHangul, isAllHangulJamos } from "../index";

const koConfig = { wordLength: 5, maxGuesses: 6, locale: "ko-KR" } as const;
const enConfig = { wordLength: 5, maxGuesses: 6, locale: "en-US" } as const;

describe("normalizeWord", () => {
  it("decomposes Hangul syllables into leading + medial + trail", () => {
    const decomposed = normalizeWord("학교", "ko-KR");
    // 학 = ㅎ+ㅏ+ㄱ (3 jamos), 교 = ㄱ+ㅗ (2 jamos, no jongseong) = 5 jamos.
    expect(decomposed.length).toBe(5);
  });

  it("lowercases English and strips spaces", () => {
    expect(normalizeWord("Apple Pie", "en-US")).toBe("applepie");
  });
});

describe("recomposeHangul", () => {
  it("round-trips through normalize+recompose", () => {
    const input = "학교";
    const decomposed = normalizeWord(input, "ko-KR");
    expect(recomposeHangul(decomposed)).toBe(input);
  });
});

describe("evaluateGuess — English", () => {
  it("all correct on exact match", () => {
    const r = evaluateGuess("apple", "apple", enConfig);
    expect(r.isCorrect).toBe(true);
    expect(r.feedback.every((f) => f.state === "correct")).toBe(true);
  });

  it("duplicate letters in guess against single in solution (APPLE vs PAPER)", () => {
    const r = evaluateGuess("paper", "apple", enConfig);
    // solution: paper (p,a,p,e,r) | guess: apple (a,p,p,l,e)
    //  i=0 a vs p -> present (one p remains)
    //  i=1 p vs a -> present (one a remains)
    //  i=2 p vs p -> correct
    //  i=3 l vs e -> absent
    //  i=4 e vs r -> present (one e remains, since the e at i=3 was used
    //     only if it matched; we used e at i=4 against r — so e is marked
    //     present and the remaining-e counter goes to 0)
    expect(r.feedback[0].state).toBe("present");
    expect(r.feedback[1].state).toBe("present");
    expect(r.feedback[2].state).toBe("correct");
    expect(r.feedback[3].state).toBe("absent");
    expect(r.feedback[4].state).toBe("present");
  });

  it("rejects wrong length", () => {
    expect(() => evaluateGuess("apple", "app", enConfig)).toThrow();
  });
});

describe("evaluateGuess — Korean", () => {
  it("matches a same-shape syllable", () => {
    // 학교 == 5 jamo? actually 학교 = 학(ㅎ+ㅏ+ㄱ) + 교(ㄱ+ㅗ+ㅇ) = 6 jamo, too long.
    // Use a 5-jamo word: 강아지 = ㄱ+ㅏ+ㅇ (3) + ㅇ+ㅏ (2) + ㅈ+ㅣ (2) = 7 jamos. Too long.
    // Build a 5-jamo word: "가나다라" = ㄱ+ㅏ (2) + ㄴ+ㅏ (2) + ㄷ+ㅏ (2) = 6 jamos. Still too long.
    // 5-jamo: 4 jamo for "가나" (ㄱ+ㅏ, ㄴ+ㅏ) plus one more syllable without trail
    //         = "가나다" = ㄱ+ㅏ, ㄴ+ㅏ, ㄷ+ㅏ = 6 jamos.
    // For the test we keep config wordLength=5 and use a word whose normalized
    // length is exactly 5.
    // 사다리 = ㅅ+ㅏ (2) + ㄷ+ㅏ (2) + ㄹ+ㅣ (2) = 6 jamos.
    // 사다 = ㅅ+ㅏ + ㄷ+ㅏ = 4 jamos.
    // 가나 = ㄱ+ㅏ + ㄴ+ㅏ = 4 jamos.
    // We need exactly 5 jamos. Let me use a 2-syllable word with one trail.
    // 사강 = ㅅ+ㅏ (2) + ㄱ+ㅏ+ㅇ (3) = 5 jamos. Good.
    const r = evaluateGuess("사강", "사강", { ...koConfig, wordLength: 5 });
    expect(r.isCorrect).toBe(true);
  });
});

describe("isAllHangulJamos", () => {
  it("accepts a normalized Korean word", () => {
    const decomposed = normalizeWord("사강", "ko-KR");
    expect(isAllHangulJamos(decomposed)).toBe(true);
  });
  it("rejects ASCII", () => {
    expect(isAllHangulJamos("apple")).toBe(false);
  });
});
