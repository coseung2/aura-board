import type { ReactNode } from "react";
import type { GameConnectionState } from "@/lib/game-platform/contracts";
import styles from "./game-platform.module.css";

export type GameHudProps = {
  title: string;
  roundLabel?: string | null;
  timeLeftMs?: number | null;
  score?: number | null;
  scoreLabel?: string | null;
  connection?: GameConnectionState;
  rulesLabel?: string | null;
  onExit?: (() => void) | null;
  exitLabel?: string;
  actions?: ReactNode;
};

function formatTime(timeLeftMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(timeLeftMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function connectionLabel(connection: GameConnectionState): string {
  if (connection === "online") return "연결됨";
  if (connection === "reconnecting") return "다시 연결 중";
  return "오프라인";
}

export function GameHud({
  title,
  roundLabel,
  timeLeftMs,
  score,
  scoreLabel = "점수",
  connection = "online",
  rulesLabel,
  onExit,
  exitLabel = "나가기",
  actions,
}: GameHudProps) {
  return (
    <header className={styles.hud}>
      <div className={styles.hudPrimary}>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.hudMeta} aria-label="게임 상태">
          {roundLabel ? <span className={styles.metaItem}>{roundLabel}</span> : null}
          {timeLeftMs != null ? (
            <span className={styles.metaItem} aria-label={`남은 시간 ${formatTime(timeLeftMs)}`}>
              {formatTime(timeLeftMs)}
            </span>
          ) : null}
          {score != null ? (
            <span className={styles.metaItem}>
              {scoreLabel} {score.toLocaleString("ko-KR")}
            </span>
          ) : null}
          <span className={styles.connection} data-state={connection} role="status">
            {connectionLabel(connection)}
          </span>
          {rulesLabel ? <span className={styles.metaItem}>{rulesLabel}</span> : null}
        </div>
      </div>
      <div className={styles.hudActions}>
        {actions}
        {onExit ? (
          <button type="button" className={styles.hudButton} onClick={onExit}>
            {exitLabel}
          </button>
        ) : null}
      </div>
    </header>
  );
}
