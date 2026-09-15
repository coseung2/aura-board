"use client";

import { memo, useMemo } from "react";
import { ArrowDown, ArrowUp, Trophy } from "lucide-react";
import type { SongGuessSnapshot } from "@/lib/song-guess/contracts";
import { GameParticipantPet } from "@/features/games/components/GameParticipantPet";
import styles from "./SongGuessScoreboard.module.css";
import teacherStyles from "./SongGuessTeacher.module.css";

type Participant = SongGuessSnapshot["participants"][number];

export function rankSongGuessParticipants(participants: Participant[]) {
  const sorted = participants
    .map((participant, index) => ({ ...participant, originalIndex: index }))
    .sort((left, right) => right.score - left.score || left.originalIndex - right.originalIndex);
  let rank = 1;
  return sorted.map((participant, index) => {
    if (index > 0 && participant.score !== sorted[index - 1].score) rank = index + 1;
    return { ...participant, rank };
  });
}

export const SongGuessParticipantPet = memo(function SongGuessParticipantPet({ participant }: { participant: Participant }) {
  return (
    <GameParticipantPet className={styles.pet} name={participant.displayName} pet={participant.representativePet} size={64} />
  );
});

export const SongGuessScoreboard = memo(function SongGuessScoreboard({
  participants,
  podium = false,
  waiting = false,
  roundResults = false,
  liveTeacher = false,
}: {
  participants: Participant[];
  podium?: boolean;
  waiting?: boolean;
  roundResults?: boolean;
  liveTeacher?: boolean;
}) {
  const ranked = useMemo(
    () => rankSongGuessParticipants(participants.filter((participant) => participant.joined !== false)),
    [participants],
  );
  const leaders = ranked.slice(0, 3);
  const visible = roundResults ? ranked.slice(0, 5) : ranked;

  if (liveTeacher) {
    return (
      <section className={teacherStyles.teacherScoreboard} aria-label="누적 순위">
        <div className={teacherStyles.scoreboardHeader}>
          <h2>누적 순위</h2>
        </div>
        <div className={teacherStyles.scoreboardStats}>
          <div className={teacherStyles.scoreboardStat}><span>참여 중</span><strong>{ranked.length}명</strong></div>
        </div>
        <div className={teacherStyles.scoreboardColumns} aria-hidden="true"><span>순위</span><span>학생</span><span>누적 점수</span></div>
        <ol className={teacherStyles.teacherScoreList} aria-label="현재 순위">
          {ranked.slice(0, 5).map((participant) => (
            <li key={participant.participantId ?? participant.originalIndex} className={teacherStyles.teacherScoreRow} data-leading={participant.rank === 1}>
              <span className={teacherStyles.teacherRank}>{participant.rank}</span>
              <div className={teacherStyles.teacherPet}><SongGuessParticipantPet participant={participant} /></div>
              <span className={teacherStyles.teacherName}>{participant.displayName}</span>
              <strong className={teacherStyles.teacherScore}>{participant.score.toLocaleString("ko-KR")}점</strong>
            </li>
          ))}
        </ol>
        {ranked.length === 0 && <p className={teacherStyles.scoreboardEmpty}>참가 학생 없음</p>}
        {ranked.length > 5 && <p className={teacherStyles.scoreboardEmpty}>전체 {ranked.length}명 · 상위 5명 표시 중</p>}
      </section>
    );
  }

  const waitingParticipants = participants
    .filter((participant) => participant.joined !== false)
    .map((participant, index) => ({ ...participant, originalIndex: index, rank: 0 }));

  return (
    <section className={styles.board} data-round-results={roundResults} aria-label={podium ? "최종 순위" : waiting ? "참가 학생" : "점수판"}>
      <h2 className={styles.heading}>
        {podium ? <><Trophy size={24} aria-hidden="true" />최종 순위</> : waiting ? "참가 학생" : roundResults ? "라운드 순위" : "점수판"}
      </h2>
      {podium && leaders.length > 0 && (
        <ol className={styles.podium} aria-label="상위 3명">
          {leaders.map((participant, index) => (
            <li key={participant.participantId ?? participant.originalIndex} className={styles.podiumPlace} data-place={index + 1}>
              <SongGuessParticipantPet participant={participant} />
              <strong className={styles.podiumName}>{participant.displayName}</strong>
              <span className={styles.podiumScore}>{participant.score.toLocaleString("ko-KR")}점</span>
              <div className={styles.pedestal} data-rank={participant.rank}>
                {participant.rank === 1 && <Trophy size={24} aria-hidden="true" />}
                <strong>{participant.rank}위</strong>
              </div>
            </li>
          ))}
        </ol>
      )}
      {podium && <h3 className={styles.listHeading}>전체 순위</h3>}
      <ol className={styles.list} aria-label={podium ? "전체 순위" : waiting ? "참가 학생 목록" : "현재 순위"}>
        {(waiting ? waitingParticipants : visible).map((participant) => (
          <li key={participant.participantId ?? participant.originalIndex} className={styles.row} data-leading={!waiting && participant.rank === 1}>
            {!waiting && <span className={styles.rank}>{participant.rank}<span className={styles.srOnly}>위</span></span>}
            <SongGuessParticipantPet participant={participant} />
            <span className={styles.name}>{participant.displayName}</span>
            {roundResults && <span className={styles.roundGain} aria-label="이번 라운드 획득 점수">{participant.roundScore === undefined ? "—" : `+${participant.roundScore}`}</span>}
            {!waiting && <strong className={styles.score}>{participant.score}점</strong>}
            {roundResults && (
              <span className={styles.movement} data-direction={participant.previousRank != null && participant.previousRank < participant.rank ? "down" : "up"}>
                {participant.previousRank == null || participant.previousRank === participant.rank ? (
                  <span aria-label="순위 유지">—</span>
                ) : (
                  <>
                    {participant.previousRank > participant.rank ? <ArrowUp size={16} aria-hidden="true" /> : <ArrowDown size={16} aria-hidden="true" />}
                    <span aria-label={`${Math.abs(participant.previousRank - participant.rank)}위 ${participant.previousRank > participant.rank ? "상승" : "하락"}`}>{Math.abs(participant.previousRank - participant.rank)}</span>
                  </>
                )}
              </span>
            )}
          </li>
        ))}
      </ol>
      {roundResults && ranked.length > 5 && (
        <details className={styles.allRanks}>
          <summary>전체 순위</summary>
          <ol className={styles.list} start={6} aria-label="6위 이하 순위">
            {ranked.slice(5).map((participant) => (
              <li className={styles.row} key={participant.participantId ?? participant.originalIndex}>
                <span className={styles.rank}>{participant.rank}위</span>
                <SongGuessParticipantPet participant={participant} />
                <span className={styles.name}>{participant.displayName}</span>
                <span className={styles.roundGain}>+{participant.roundScore ?? 0}</span>
                <strong className={styles.score}>{participant.score}점</strong>
              </li>
            ))}
          </ol>
        </details>
      )}
      {ranked.length === 0 && <p className={styles.empty}>참가 학생 없음</p>}
    </section>
  );
});
