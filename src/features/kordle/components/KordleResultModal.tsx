"use client";

import Link from "next/link";
import { useState } from "react";
import type { KordleTerminalReason } from "../engine";

type Props = {
  status: "WON" | "LOST" | "ABANDONED" | "IN_PROGRESS";
  solvedAtGuess: number | null;
  totalGuesses: number;
  terminalReason?: KordleTerminalReason | null;
  resultId?: string | null;
};

function resultCopy(
  status: Props["status"],
  terminalReason: KordleTerminalReason | null | undefined,
  solvedAtGuess: number | null,
  totalGuesses: number,
) {
  if (status === "WON") {
    return {
      title: "정답입니다!",
      body: `${solvedAtGuess ?? 0}번 만에 맞혔습니다.`,
    };
  }
  if (status === "ABANDONED") {
    return terminalReason === "host_ended"
      ? {
          title: "게임이 종료됐어요",
          body: "진행자가 이 문제를 종료했습니다. 확정된 결과는 나의 전적에서 확인할 수 있어요.",
        }
      : {
          title: "이번 시도를 마쳤어요",
          body: "게임에서 나간 결과가 나의 전적에 기록되었습니다.",
        };
  }
  return {
    title: "아쉬워요",
    body:
      terminalReason === "deadline"
        ? "제한 시간이 끝났습니다."
        : `${totalGuesses}번 시도했지만 맞히지 못했습니다.`,
  };
}

export function KordleResultModal({
  status,
  terminalReason,
  solvedAtGuess,
  totalGuesses,
  resultId,
}: Props) {
  const [open, setOpen] = useState(true);
  if (status === "IN_PROGRESS" || !open) return null;
  const copy = resultCopy(status, terminalReason, solvedAtGuess, totalGuesses);
  return (
    <div className="kordle-result" role="dialog" aria-modal="true" aria-label="게임 결과">
      <div className="kordle-result-card">
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
        {resultId ? <p className="kordle-result-id">기록 번호 {resultId}</p> : null}
        <div className="kordle-result-actions">
          <button
            type="button"
            className="kordle-result-close"
            onClick={() => setOpen(false)}
          >
            결과판 닫기
          </button>
          <Link className="kordle-result-close" href="/student/boards?category=play&playTab=games">
            게임 목록
          </Link>
          <Link
            className="kordle-result-close"
            href="/student/boards?category=play&playTab=records&game=kordle"
          >
            나의 전적
          </Link>
        </div>
      </div>
    </div>
  );
}
