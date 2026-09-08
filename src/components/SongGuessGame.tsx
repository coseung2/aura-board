"use client";

import { useMemo, type ReactNode } from "react";
import { Check, Clock3, Users, Volume2, VolumeX } from "lucide-react";
import type { SongGuessGuessResult, SongGuessIntent, SongGuessSnapshot } from "@/lib/song-guess/contracts";
import { songGuessAnswerPrompt, SONG_GUESS_ANSWER_TARGET_LABELS } from "@/lib/song-guess/contracts";
import { SongGuessPlayer } from "./SongGuessPlayer";
import { SongGuessScoreboard } from "./SongGuessScoreboard";
import { SongGuessEntrance } from "./SongGuessEntrance";
import { useSongGuessSounds } from "./use-song-guess-sounds";
import controls from "./SongGuessBoard.module.css";
import styles from "./SongGuessGame.module.css";

type Props = {
  snapshot: SongGuessSnapshot;
  totalRounds: number | null;
  canInteract: boolean;
  remainingSeconds: number | null;
  expired: boolean;
  guessText: string;
  onGuessText: (text: string) => void;
  onIntent: (intent: SongGuessIntent) => void;
  result: SongGuessGuessResult | null;
  onReloadSetup: () => void;
  status: ReactNode;
  entryFailed?: boolean;
};

export function SongGuessGame({ snapshot, totalRounds, canInteract, remainingSeconds, expired,
  guessText, onGuessText, onIntent, result, onReloadSetup, status, entryFailed }: Props) {
  const { phase, currentRound } = snapshot;
  const participants = useMemo(() => snapshot.participants.filter((participant) => participant.joined !== false), [snapshot.participants]);
  const sound = useSongGuessSounds(snapshot, result, remainingSeconds);
  const isHost = snapshot.viewer.role === "host";
  const waiting = phase === "draft" || phase === "lobby";
  const finished = phase === "finished";
  const roundResults = phase === "reveal";
  const scoredCount = participants.filter((participant) => participant.scoredCurrentRound).length;
  const roundDuration = currentRound.deadlineAtMs != null && currentRound.startedAtMs != null
    ? Math.max(1, (currentRound.deadlineAtMs - currentRound.startedAtMs) / 1000) : 30;
  const hasNextRound = totalRounds === null ? null : currentRound.order + 1 < totalRounds;
  const feedback = result?.roundId === currentRound.roundId ? result : null;
  const multipleChoice = snapshot.answerMode === "multiple-choice";
  const answerPrompt = songGuessAnswerPrompt(snapshot.answerTarget);
  const answered = multipleChoice && (snapshot.viewer.answeredCurrentRound === true || snapshot.viewer.selectedChoiceId != null);
  const answerDisabled = !canInteract || expired || snapshot.viewer.scoredCurrentRound || answered;

  return (
    <div className={styles.layout} data-finished={finished || roundResults || waiting} onPointerDownCapture={sound.unlock} onKeyDownCapture={sound.unlock}>
      <main className={styles.stage}>
        <div className={styles.roundHeading}>
          <span>{finished ? "최종 결과" : waiting ? "시작 대기" : `${currentRound.order + 1}라운드${totalRounds ? ` / ${totalRounds}` : ""}`}</span>
          <div className={styles.headingActions}><span className={styles.participantCount}><Users size={16} aria-hidden="true" />{participants.length}명</span>
            <button type="button" className={controls.iconButton} onClick={sound.toggleMuted} aria-label={sound.muted ? "효과음 켜기" : "효과음 끄기"} aria-pressed={!sound.muted}>
              {sound.muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {phase === "guessing" && remainingSeconds !== null && (
          <div className={styles.clock} data-expired={expired}>
            <div role="timer" aria-label="남은 시간"><Clock3 size={18} aria-hidden="true" /><strong>{expired ? "시간 종료" : `${remainingSeconds}초 남음`}</strong></div>
            <progress max={roundDuration} value={remainingSeconds} aria-label="남은 응답 시간" />
          </div>
        )}

        {waiting && <SongGuessEntrance snapshot={snapshot} canInteract={canInteract} failed={entryFailed} onJoin={() => onIntent({ type: "join" })} />}

        {phase === "guessing" && (
          <div className={styles.question}>
            <p className={styles.clue}>{SONG_GUESS_ANSWER_TARGET_LABELS[snapshot.answerTarget ?? "title"]}</p>
            {currentRound.currentClip && <SongGuessPlayer key={`${snapshot.sessionId}:${currentRound.currentClip.assetId}`} sessionId={snapshot.sessionId} clip={currentRound.currentClip} onPlayingChange={sound.onMusicPlaying} />}
            {currentRound.accessibilityClue && <p className={styles.clue}>{currentRound.accessibilityClue}</p>}
            {!isHost && snapshot.viewer.joined === false && <p className={styles.scored}>입장이 마감됐어요. 다음 게임을 기다려 주세요.</p>}
            {multipleChoice && (isHost || snapshot.viewer.joined !== false) && (
              <div className={styles.choices} role="group" aria-label={`${answerPrompt} 보기`}>
                {currentRound.choices?.map((choice, index) => (
                  <button key={choice.id} type="button" className={styles.choice}
                    data-option={index} aria-pressed={snapshot.viewer.selectedChoiceId === choice.id}
                    disabled={isHost || answerDisabled}
                    onClick={() => onIntent({ type: "guess", choiceId: choice.id, roundId: currentRound.roundId })}>
                    <span className={styles.choiceNumber} aria-hidden="true">{index + 1}</span>
                    <span>{choice.label}</span>
                    {snapshot.viewer.selectedChoiceId === choice.id && <Check size={20} aria-label="선택한 답" />}
                  </button>
                ))}
              </div>
            )}
            {!multipleChoice && !isHost && snapshot.viewer.joined !== false && (
              <form className={styles.answerForm} onSubmit={(event) => {
                event.preventDefault();
                const text = guessText.trim();
                if (!text || !canInteract || expired || snapshot.viewer.scoredCurrentRound || snapshot.viewer.joined === false) return;
                onIntent({ type: "guess", text });
                onGuessText("");
              }}>
                <input aria-label={answerPrompt} value={guessText} maxLength={200} placeholder={snapshot.answerTarget === "artist-title" ? "가수·작곡가 - 노래 제목" : "정답 입력"}
                  autoComplete="off" enterKeyHint="send" disabled={!canInteract || expired || snapshot.viewer.scoredCurrentRound}
                  onChange={(event) => onGuessText(event.target.value)} />
                <button className={controls.primaryButton} type="submit" disabled={!canInteract || expired || !guessText.trim() || snapshot.viewer.scoredCurrentRound}>정답 제출</button>
              </form>
            )}
            {feedback && <p className={feedback.correct ? controls.correctResult : controls.wrongResult} role="status">
              {feedback.timedOut ? "시간이 끝났어요." : feedback.alreadyScored ? "이 라운드는 이미 점수를 받았어요." : feedback.correct ? `정답! +${feedback.score}점` : multipleChoice ? "아쉬워요! 정답 공개를 기다려 주세요." : "다시 도전해 보세요."}
            </p>}
            {!feedback && snapshot.viewer.scoredCurrentRound && <p className={styles.scored} role="status"><Check size={18} aria-hidden="true" />정답 제출 완료</p>}
            {!feedback && answered && !snapshot.viewer.scoredCurrentRound && <p className={styles.scored} role="status">답변 제출 완료 · 정답 공개를 기다려 주세요.</p>}
            {isHost && <p className={styles.scored}>{scoredCount} / {participants.length}명 정답</p>}
          </div>
        )}

        {roundResults && <>
          <div className={styles.roundAnswer}>
            <div><p>정답</p><h2>{currentRound.revealedAnswer ?? "정답을 불러오는 중…"}</h2></div>
            <span>{scoredCount} / {participants.length}명 정답</span>
          </div>
          <SongGuessScoreboard participants={participants} roundResults />
        </>}

        {finished && <SongGuessScoreboard participants={participants} podium />}

        {isHost && !finished && <div className={styles.hostActions}>
          {phase === "draft" && <button className={controls.primaryButton} type="button" disabled={!canInteract} onClick={() => onIntent({ type: "open_lobby" })}>로비 열기</button>}
          {phase === "lobby" && <button className={controls.primaryButton} type="button" disabled={!canInteract || participants.length === 0} onClick={() => onIntent({ type: "start" })}>음악 퀴즈 시작</button>}
          {phase === "guessing" && <>
            {currentRound.currentClip && currentRound.currentClip.tierMs < 1500 && <button className={controls.secondaryButton} type="button" disabled={!canInteract || expired} onClick={() => onIntent({ type: "unlock_clip" })}>다음 길이 클립 열기</button>}
            <button className={controls.primaryButton} type="button" disabled={!canInteract} onClick={() => onIntent({ type: "reveal" })}>정답 공개</button>
          </>}
          {phase === "reveal" && <button className={controls.primaryButton} type="button" disabled={!canInteract || hasNextRound === null}
            onClick={() => { if (hasNextRound !== null) onIntent({ type: hasNextRound ? "next_round" : "finish" }); }}>
            {hasNextRound === null ? "라운드 구성 확인 필요" : hasNextRound ? "다음 라운드" : "게임 끝내기"}
          </button>}
          {totalRounds === null && <button className={controls.secondaryButton} type="button" disabled={!canInteract} onClick={onReloadSetup}>라운드 구성 다시 불러오기</button>}
        </div>}
        <div className={styles.status}>{status}</div>
      </main>
      {!finished && !roundResults && !waiting && <aside className={styles.scoreboard}><SongGuessScoreboard participants={participants} /></aside>}
    </div>
  );
}
