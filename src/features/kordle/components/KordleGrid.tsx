"use client";

import type { GuessFeedback } from "../engine";

type Props = {
  wordLength: number;
  maxGuesses: number;
  pastGuesses: GuessFeedback[];
  pending: string[];
  isKorean: boolean;
};

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
            if (typeof cell === "string") {
              return (
                <div
                  className="kordle-cell kordle-cell--empty"
                  key={colIdx}
                  role="gridcell"
                  aria-label={cell || "empty"}
                >
                  {cell}
                </div>
              );
            }
            return (
              <div
                className={`kordle-cell kordle-cell--${cell.state}`}
                key={colIdx}
                role="gridcell"
                aria-label={`${cell.char} ${cell.state}`}
              >
                {cell.char}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
