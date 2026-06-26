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
    <div className="kordle-result" role="dialog" aria-modal="true" aria-label="Game result">
      <div className="kordle-result-card">
        <h2>{won ? "????!" : "????"}</h2>
        <p>
          {won
            ? `${solvedAtGuess ?? "?"}?? ??? ????.`
            : `${totalGuesses}? ????? ? ????.`}
        </p>
        <button
          type="button"
          className="kordle-result-close"
          onClick={() => window.location.reload()}
        >
          ?? ??
        </button>
      </div>
    </div>
  );
}
