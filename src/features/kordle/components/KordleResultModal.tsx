"use client";

type Props = {
  status: "WON" | "LOST" | "ABANDONED" | "IN_PROGRESS";
  solvedAtGuess: number | null;
  totalGuesses: number;
};

export function KordleResultModal({ status, solvedAtGuess, totalGuesses }: Props) {
  if (status === "IN_PROGRESS") return null;
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
          onClick={() => window.location.reload()}
        >
          다시 시작
        </button>
      </div>
    </div>
  );
}
