"use client";

import { useState } from "react";

type Props = {
  status: "WON" | "LOST" | "ABANDONED" | "IN_PROGRESS";
  solvedAtGuess: number | null;
  totalGuesses: number;
};

export function KordleResultModal({ status, solvedAtGuess, totalGuesses }: Props) {
  const [open, setOpen] = useState(true);
  if (status === "IN_PROGRESS") return null;
  if (!open) return null;
  const won = status === "WON";
  return (
    <div className="kordle-result" role="dialog" aria-modal="true" aria-label="게임 결과">
      <div className="kordle-result-card">
        <h2>{won ? "정답입니다!" : "아쉬워요"}</h2>
        <p>
          {won
            ? `${solvedAtGuess ?? 0}번 만에 맞혔습니다.`
            : `${totalGuesses}번 시도했지만 맞히지 못했습니다.`}
        </p>
        <button
          type="button"
          className="kordle-result-close"
          onClick={() => setOpen(false)}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
