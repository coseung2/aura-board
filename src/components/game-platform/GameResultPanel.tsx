import type { ReactNode } from "react";
import type { GameOutcome } from "@/lib/game-platform/contracts";
import styles from "./game-platform.module.css";

export type GameResultMetric = {
  label: string;
  value: ReactNode;
};

export type GameResultPanelProps = {
  outcome: GameOutcome;
  score?: number | null;
  durationMs?: number | null;
  metrics?: readonly GameResultMetric[];
  message?: string | null;
  resultId?: string | null;
  retryAction?: ReactNode;
  gamesAction?: ReactNode;
  recordsAction?: ReactNode;
};

function outcomeLabel(outcome: GameOutcome): string {
  switch (outcome) {
    case "win": return "승리";
    case "loss": return "패배";
    case "draw": return "무승부";
    case "completed": return "게임 완료";
    case "forfeit": return "기권";
    case "abandoned": return "게임에서 나감";
    case "host-ended": return "진행자가 게임을 종료함";
  }
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

export function GameResultPanel({
  outcome,
  score,
  durationMs,
  metrics = [],
  message,
  resultId,
  retryAction,
  gamesAction,
  recordsAction,
}: GameResultPanelProps) {
  return (
    <section className={styles.resultPanel} aria-labelledby="game-result-title">
      <p className={styles.eyebrow}>Result</p>
      <h2 id="game-result-title" className={styles.resultOutcome}>
        {outcomeLabel(outcome)}
      </h2>
      {message ? <p>{message}</p> : null}
      <dl className={styles.summaryGrid}>
        {score != null ? (
          <div className={styles.metric}>
            <dt>점수</dt>
            <dd>{score.toLocaleString("ko-KR")}</dd>
          </div>
        ) : null}
        {durationMs != null ? (
          <div className={styles.metric}>
            <dt>진행 시간</dt>
            <dd>{formatDuration(durationMs)}</dd>
          </div>
        ) : null}
        {metrics.map((metric) => (
          <div className={styles.metric} key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
      {resultId ? <p className={styles.muted}>기록 번호 {resultId}</p> : null}
      <div className={styles.resultActions}>
        {retryAction}
        {gamesAction}
        {recordsAction}
      </div>
    </section>
  );
}
