import type { ReactNode } from "react";
import type { GameConnectionState } from "@/lib/game-platform/contracts";
import { GameHud, type GameHudProps } from "./GameHud";
import styles from "./game-platform.module.css";

export type GameAreaShellProps = Omit<GameHudProps, "connection"> & {
  children: ReactNode;
  connection?: GameConnectionState;
  inputLocked?: boolean;
  statusMessage?: string | null;
  hostControls?: ReactNode;
  participantActions?: ReactNode;
  className?: string;
};

export function GameAreaShell({
  children,
  connection = "online",
  inputLocked = false,
  statusMessage,
  hostControls,
  participantActions,
  className,
  ...hudProps
}: GameAreaShellProps) {
  const locked = inputLocked || connection !== "online";
  return (
    <main className={[styles.shell, className].filter(Boolean).join(" ")}>
      <section className={styles.frame} aria-busy={locked || undefined}>
        <GameHud {...hudProps} connection={connection} />
        <div className={styles.playfield}>
          {hostControls ? (
            <section className={styles.hostZone} aria-label="진행자 조작">
              <p className={styles.zoneLabel}>진행자 조작</p>
              {hostControls}
            </section>
          ) : null}
          {participantActions ? (
            <section className={styles.participantZone} aria-label="참가자 조작">
              <p className={styles.zoneLabel}>참가자 조작</p>
              {participantActions}
            </section>
          ) : null}
          {children}
          {locked ? (
            <div className={styles.reconnectOverlay} role="status" aria-live="polite">
              <div className={styles.reconnectCard}>
                <strong>
                  {connection === "offline" ? "연결이 끊겼어요" : "최신 상태를 확인 중이에요"}
                </strong>
                <p>
                  {statusMessage ??
                    "입력은 잠시 잠겨요. 연결이 복구되면 서버의 최신 게임 상태를 다시 불러옵니다."}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
