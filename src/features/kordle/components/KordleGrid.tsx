"use client";

import type { GuessFeedback } from "../engine";

type Props = {
  wordLength: number;
  maxGuesses: number;
  pastGuesses: GuessFeedback[];
  pending: string[];
  isKorean: boolean;
};

const LEAD_TO_COMPAT = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
];
const MEDIAL_TO_COMPAT = [
  "ㅏ",
  "ㅐ",
  "ㅑ",
  "ㅒ",
  "ㅓ",
  "ㅔ",
  "ㅕ",
  "ㅖ",
  "ㅗ",
  "ㅘ",
  "ㅙ",
  "ㅚ",
  "ㅛ",
  "ㅜ",
  "ㅝ",
  "ㅞ",
  "ㅟ",
  "ㅠ",
  "ㅡ",
  "ㅢ",
  "ㅣ",
];
const TRAIL_TO_COMPAT = [
  "ㄱ",
  "ㄲ",
  "ㄳ",
  "ㄴ",
  "ㄵ",
  "ㄶ",
  "ㄷ",
  "ㄹ",
  "ㄺ",
  "ㄻ",
  "ㄼ",
  "ㄽ",
  "ㄾ",
  "ㄿ",
  "ㅀ",
  "ㅁ",
  "ㅂ",
  "ㅄ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
];

function displayChar(char: string | undefined, isKorean: boolean): string {
  if (!char || !isKorean) return char ?? "";
  const cp = char.codePointAt(0);
  if (cp === undefined) return char;
  if (cp >= 0x1100 && cp <= 0x1112) {
    return LEAD_TO_COMPAT[cp - 0x1100] ?? char;
  }
  if (cp >= 0x1161 && cp <= 0x1175) {
    return MEDIAL_TO_COMPAT[cp - 0x1161] ?? char;
  }
  if (cp >= 0x11a8 && cp <= 0x11c2) {
    return TRAIL_TO_COMPAT[cp - 0x11a8] ?? char;
  }
  return char;
}

export function KordleGrid({ wordLength, maxGuesses, pastGuesses, pending, isKorean }: Props) {
  const rows: Array<GuessFeedback | string[]> = [];
  for (let i = 0; i < pastGuesses.length; i++) {
    rows.push(pastGuesses[i]);
  }
  if (rows.length < maxGuesses) {
    rows.push(pending);
  }
  while (rows.length < maxGuesses) {
    rows.push(new Array<string>(wordLength).fill(""));
  }
  return (
    <div
      className="kordle-grid"
      role="grid"
      aria-label="Kordle guess grid"
      data-locale={isKorean ? "ko" : "en"}
      style={{ ["--kordle-rows" as string]: maxGuesses, ["--kordle-cols" as string]: wordLength } as React.CSSProperties}
    >
      {rows.map((row, rowIdx) => (
        <div className="kordle-row" role="row" key={rowIdx}>
         {Array.from({ length: wordLength }).map((_, colIdx) => {
           const cell = row[colIdx];
            // Pending rows are shorter than `wordLength` while typing, so
            // out-of-range cells are `undefined`; render them as empty.
            if (cell === undefined || typeof cell === "string") {
              const shown = displayChar(cell, isKorean);
              return (
                <div
                  className="kordle-cell kordle-cell--empty"
                  key={colIdx}
                  role="gridcell"
                  aria-label={shown || "empty"}
                >
                  {shown}
                </div>
              );
            }
            const shown = displayChar(cell.char, isKorean);
            return (
              <div
                className={`kordle-cell kordle-cell--${cell.state}`}
                key={colIdx}
                role="gridcell"
                aria-label={`${shown} ${cell.state}`}
              >
                {shown}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
