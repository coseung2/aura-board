"use client";

import { useEffect, useRef } from "react";
import { Check, Music2 } from "lucide-react";
import type { SongGuessSnapshot } from "@/lib/song-guess/contracts";
import { SongGuessParticipantPet } from "./SongGuessScoreboard";
import styles from "./SongGuessGame.module.css";

export function SongGuessEntrance({ snapshot, canInteract, onJoin, failed = false }: {
  snapshot: SongGuessSnapshot;
  canInteract: boolean;
  onJoin: () => void;
  failed?: boolean;
}) {
  const joiningSession = useRef<string | null>(null);
  const isHost = snapshot.viewer.role === "host";
  const joined = snapshot.participants.filter((participant) => participant.joined !== false);
  const own = snapshot.viewer.participantIndex != null ? snapshot.participants[snapshot.viewer.participantIndex] : null;

  useEffect(() => {
    if (isHost || snapshot.phase !== "lobby" || snapshot.viewer.joined !== false || !canInteract || joiningSession.current === snapshot.sessionId) return;
    joiningSession.current = snapshot.sessionId;
    onJoin();
  }, [isHost, snapshot.phase, snapshot.viewer.joined, snapshot.sessionId, canInteract, onJoin]);

  return <div className={styles.entrance}>
    {isHost ? <>
      <div className={styles.invitation}>
        <Music2 size={40} strokeWidth={1.5} aria-hidden="true" />
        <div><h2>{snapshot.phase === "draft" ? "게임 준비" : "입장을 기다리고 있어요"}</h2><p>{joined.length}명 입장</p></div>
      </div>
    </> : <div className={styles.myEntry}>
      {own ? <><SongGuessParticipantPet participant={own} /><h2>{own.displayName}</h2></> : <Music2 size={64} aria-hidden="true" />}
      {snapshot.phase === "draft" ? <p>게임 준비 중</p> : snapshot.viewer.joined === false
        ? <p className={styles.scored} role="status">{failed ? "입장하지 못했어요" : "입장 중…"}</p>
        : <p className={styles.scored}><Check size={18} aria-hidden="true" />입장 완료</p>}
    </div>}
    <div className={styles.entrants} aria-label="입장한 학생">
      {joined.map((participant, index) => <div key={participant.participantId ?? index} className={styles.entrant}>
        <SongGuessParticipantPet participant={participant} /><strong>{participant.displayName}</strong>
      </div>)}
      {joined.length === 0 && <p className={styles.emptyEntrants}>입장한 학생이 아직 없어요</p>}
    </div>
  </div>;
}
