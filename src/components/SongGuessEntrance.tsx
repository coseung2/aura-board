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
      {snapshot.phase === "draft" && (
        <div className={styles.createdSummary}>
          <span className={styles.createdEyebrow}>STEP 1</span>
          <h2 className={styles.createdTitle}>게임이 만들어졌어요</h2>
          <p className={styles.createdNote}>학생 입장을 받기 전에 로비를 열어 주세요.</p>
          <div className={styles.createdCard}>
            <strong>{snapshot.answerMode === "multiple-choice" ? "객관식 4지선다" : "직접 입력"}</strong>
            <span>
              {snapshot.answerTarget === "artist"
                ? "가수·작곡가 맞히기"
                : snapshot.answerTarget === "artist-title"
                  ? "가수·작곡가와 제목 맞히기"
                  : "곡명 맞히기"}
            </span>
            <span className={styles.createdClosed}>학생 입장 닫힘</span>
          </div>
        </div>
      )}
      <div className={styles.invitation}>
        <Music2 size={40} strokeWidth={1.5} aria-hidden="true" />
        <div>
          <h2>{snapshot.phase === "draft" ? "게임 준비" : "학생 입장 대기"}</h2>
          <p>
            {snapshot.phase === "draft"
              ? "로비를 열면 학생 기기에서 자동으로 입장을 시도합니다."
              : "준비된 학생이 들어오면 대표 펫과 이름만 즉시 표시됩니다."}
          </p>
        </div>
        <div className={styles.entryStat}>
          <span>입장</span>
          <strong>{joined.length}명</strong>
          <span className={styles.entryStatLive}>LIVE</span>
        </div>
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
    {isHost && snapshot.phase === "lobby" && (
      <p className={styles.entryHint}>
        {joined.length > 0
          ? `${joined.length}명 입장 완료 · 최소 1명 이상이면 시작할 수 있어요`
          : "학생이 1명 이상 입장하면 시작할 수 있어요"}
      </p>
    )}
  </div>;
}
