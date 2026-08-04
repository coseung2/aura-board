import type { ReactNode } from "react";
import type { GameConnectionState } from "@/lib/game-platform/contracts";
import styles from "./game-platform.module.css";

export type GameHudProps = {
  title?: string | null;
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

export function GameHud({
  onExit,
  exitLabel = "나가기",
  actions,
}: GameHudProps) {
  if (!onExit && !actions) return null;
  return (
    <div className={styles.hud} role="toolbar" aria-label="게임 조작">
      <div className={styles.hudActions}>
        {actions}
        {onExit ? (
          <button type="button" className={styles.hudButton} onClick={onExit}>
            {exitLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
