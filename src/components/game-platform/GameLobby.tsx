import type { ReactNode } from "react";
import styles from "./game-platform.module.css";

export type GameLobbyParticipant = {
  id: string;
  name: string;
  state?: "invited" | "joined" | "ready" | "forfeited";
};

export type GameLobbyProps = {
  title?: string;
  description?: string;
  participants?: readonly GameLobbyParticipant[];
  capacity?: number | null;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  participantMessage?: string | null;
  actions?: ReactNode;
};

function stateLabel(state: GameLobbyParticipant["state"]): string {
  if (state === "ready") return "준비 완료";
  if (state === "joined") return "입장";
  if (state === "forfeited") return "나감";
  return "초대됨";
}

export function GameLobby({
  title = "게임 대기실",
  description = "참가자를 확인하고 준비가 되면 시작하세요.",
  participants = [],
  capacity,
  loading = false,
  error,
  emptyMessage = "아직 입장한 참가자가 없어요.",
  participantMessage,
  actions,
}: GameLobbyProps) {
  return (
    <section className={styles.lobby} aria-busy={loading || undefined}>
      <p className={styles.eyebrow}>Lobby</p>
      <h2>{title}</h2>
      <p className={styles.muted}>{description}</p>
      {participantMessage ? <p role="status">{participantMessage}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {loading ? (
        <div className={styles.lobbyGrid} aria-label="대기실 불러오는 중">
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      ) : participants.length === 0 ? (
        <p className={styles.empty}>{emptyMessage}</p>
      ) : (
        <div className={styles.lobbyGrid}>
          {participants.map((participant) => (
            <div className={styles.participantRow} key={participant.id}>
              <strong>{participant.name}</strong>
              <span className={styles.participantState}>{stateLabel(participant.state)}</span>
            </div>
          ))}
        </div>
      )}
      <p className={styles.muted}>
        {capacity == null
          ? `${participants.length}명`
          : `${participants.length}/${capacity}명`}
      </p>
      {actions ? <div className={styles.resultActions}>{actions}</div> : null}
    </section>
  );
}
