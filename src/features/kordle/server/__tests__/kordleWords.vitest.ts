import { describe, expect, it } from "vitest";
import {
  KORDLE_FALLBACK_WORDS,
  KORDLE_WORD_LENGTH,
  uniqueValidKordleWords,
} from "../kordleWords";

describe("kordleWords", () => {
  it("keeps fallback words valid for the fixed Kordle length", () => {
    for (const locale of ["en-US", "ko-KR"] as const) {
      const valid = uniqueValidKordleWords(
        KORDLE_FALLBACK_WORDS[locale],
        locale,
        KORDLE_WORD_LENGTH,
      );

      expect(valid.map((word) => word.text)).toEqual(KORDLE_FALLBACK_WORDS[locale]);
    }
  });

  it("filters generated candidates by locale, length, and duplicates", () => {
    expect(
      uniqueValidKordleWords(
        ["planet", "PLANET", "ice-cream", "cat", "school!"],
        "en-US",
        KORDLE_WORD_LENGTH,
      ).map((word) => word.text),
    ).toEqual(["planet", "school"]);

    expect(
      uniqueValidKordleWords(
        ["바나나", "바나나!", "학교", "고구마"],
        "ko-KR",
        KORDLE_WORD_LENGTH,
      ).map((word) => word.text),
    ).toEqual(["바나나", "고구마"]);
  });
});
