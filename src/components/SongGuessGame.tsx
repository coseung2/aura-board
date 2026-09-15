"use client";

import { useMemo, type ReactNode } from "react";
import { ArrowLeft, Check, LogOut, Users, Volume2, VolumeX, X } from "lucide-react";
import type {
  SongGuessGuessResult,
  SongGuessIntent,
  SongGuessSnapshot,
} from "@/lib/song-guess/contracts";
import {
  normalizeSongGuessAnswer,
  songGuessAnswerPrompt,
} from "@/lib/song-guess/contracts";
import { SongGuessPlayer } from "./SongGuessPlayer";
import { SongGuessScoreboard } from "./SongGuessScoreboard";
import { SongGuessEntrance } from "./SongGuessEntrance";
import { SongGuessTeacherTimer } from "./SongGuessTeacherTimer";
import { useSongGuessSounds } from "./use-song-guess-sounds";
import controls from "./SongGuessBoard.module.css";
import styles from "./SongGuessGame.module.css";
import teacherStyles from "./SongGuessTeacher.module.css";

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
  onExit: () => void;
};

function teacherQuestion(target: SongGuessSnapshot["answerTarget"]) {
  if (target === "artist") return "이 곡의 가수·작곡가는?";
  if (target === "artist-title") return "이 곡의 가수·작곡가와 제목은?";
  return "이 곡의 제목은?";
}

export function SongGuessGame({
  snapshot,
  totalRounds,
  canInteract,
  remainingSeconds,
  expired,
  guessText,
  onGuessText,
  onIntent,
  result,
  onReloadSetup,
  status,
  entryFailed,
  onExit,
}: Props) {
  const { phase, currentRound } = snapshot;
  const participants = useMemo(
    () => snapshot.participants.filter((participant) => participant.joined !== false),
    [snapshot.participants],
  );
  const sound = useSongGuessSounds(snapshot, result, remainingSeconds);
  const isHost = snapshot.viewer.role === "host";
  const studentView = !isHost;
  /** Leaving already ends the room for its host, so the host only gets one
   * exit action: 끝내기. */
  const finishesRoom =
    snapshot.viewer.isRoomHost === true || snapshot.viewer.role === "host";
  const exitKind = phase === "finished" ? "back" : finishesRoom ? "finish" : "leave";
  const exitLabel =
    exitKind === "back" ? "방 목록" : exitKind === "finish" ? "게임 끝내기" : "방 나가기";
  const waiting = phase === "draft" || phase === "lobby";
  const finished = phase === "finished";
  const roundResults = phase === "reveal";
  const scoredCount = participants.filter(
    (participant) => participant.scoredCurrentRound,
  ).length;
  const roundDuration =
    currentRound.deadlineAtMs != null && currentRound.startedAtMs != null
      ? Math.max(1, (currentRound.deadlineAtMs - currentRound.startedAtMs) / 1000)
      : 30;
  const hasNextRound =
    totalRounds === null ? null : currentRound.order + 1 < totalRounds;
  const multipleChoice = snapshot.answerMode === "multiple-choice";
  const answerPrompt = songGuessAnswerPrompt(snapshot.answerTarget);
  const questionText = studentView
    ? teacherQuestion(snapshot.answerTarget)
    : teacherQuestion(snapshot.answerTarget);
  const answered =
    multipleChoice &&
    (snapshot.viewer.answeredCurrentRound === true ||
      snapshot.viewer.selectedChoiceId != null);
  const answerDisabled =
    !canInteract || expired || snapshot.viewer.scoredCurrentRound || answered;
  const ownParticipant =
    snapshot.viewer.participantIndex == null
      ? studentView ? participants[0] ?? null : null
      : snapshot.participants[snapshot.viewer.participantIndex] ?? null;
  const ownRank = ownParticipant
    ? participants.filter((participant) => participant.score > ownParticipant.score).length + 1
    : null;
  const ownRankMovement = ownParticipant?.previousRank != null && ownRank != null
    ? ownParticipant.previousRank - ownRank
    : 0;

  return (
    <div
      className={`${styles.layout} ${isHost ? teacherStyles.teacherGame : ""}`}
      data-viewer={studentView ? "student" : "teacher"}
      data-finished={finished || roundResults || waiting}
      onPointerDownCapture={sound.unlock}
      onKeyDownCapture={sound.unlock}
    >
      <main className={styles.stage} data-song-stage>
        <div className={styles.roundHeading} data-song-round-heading>
          <div className={styles.headingCopy}>
            {studentView && <strong className={styles.gameTitle}>노래 맞히기</strong>}
            <span className={styles.roundLabel} data-song-round-label>
              {finished
                ? "최종 결과"
                : waiting
                  ? "시작 대기"
                  : `${String(currentRound.order + 1).padStart(2, "0")}${totalRounds ? ` / ${String(totalRounds).padStart(2, "0")}` : ""}`}
            </span>
          </div>
          <div className={styles.headingActions}>
            {studentView && phase === "guessing" && remainingSeconds !== null ? (
              <span className={styles.studentTime} data-expired={expired}>
                {expired ? "시간 종료" : `${remainingSeconds}초`}
              </span>
            ) : (
              <span className={styles.participantCount}>
                <Users size={16} aria-hidden="true" />
                {participants.length}명
              </span>
            )}
            <button
              type="button"
              className={controls.iconButton}
              onClick={sound.toggleMuted}
              aria-label={sound.muted ? "효과음 켜기" : "효과음 끄기"}
              aria-pressed={!sound.muted}
            >
              {sound.muted ? (
                <VolumeX size={18} aria-hidden="true" />
              ) : (
                <Volume2 size={18} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className={controls.iconButton}
              onClick={onExit}
              aria-label={exitLabel}
            >
              {exitKind === "finish" ? (
                <X size={18} aria-hidden="true" />
              ) : exitKind === "back" ? (
                <ArrowLeft size={18} aria-hidden="true" />
              ) : (
                <LogOut size={18} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {studentView && phase === "guessing" && remainingSeconds !== null && (
          <div className={styles.clock} data-expired={expired}>
            <progress
              max={roundDuration}
              value={remainingSeconds}
              aria-label="남은 응답 시간"
            />
          </div>
        )}

        {waiting && (
          <SongGuessEntrance
            snapshot={snapshot}
            canInteract={canInteract}
            failed={entryFailed}
            onJoin={() => onIntent({ type: "join" })}
          />
        )}

        {phase === "guessing" && (
          <div className={styles.question} data-song-question>
            {!studentView && <p className={teacherStyles.teacherQuestion}>{questionText}</p>}
            {currentRound.currentClip && (
              <div className={studentView ? styles.studentMusicCard : undefined}>
                <SongGuessPlayer
                  key={`${snapshot.sessionId}:${currentRound.currentClip.assetId}`}
                  sessionId={snapshot.sessionId}
                  clip={currentRound.currentClip}
                  onPlayingChange={sound.onMusicPlaying}
                  teacher={isHost}
                  remainingSeconds={remainingSeconds}
                  roundDurationSeconds={roundDuration}
                />
                {studentView && <p className={styles.studentQuestion}>{questionText}</p>}
              </div>
            )}
            {isHost &&
              (!currentRound.currentClip ||
                !currentRound.currentClip.mimeType.startsWith("audio/")) && (
                <SongGuessTeacherTimer
                  remainingSeconds={remainingSeconds}
                  roundDurationSeconds={roundDuration}
                />
              )}
            {currentRound.accessibilityClue && (
              <div className={styles.clueCard}>
                <span className={styles.clueLabel}>글자 힌트</span>
                <p className={styles.clue}>{currentRound.accessibilityClue}</p>
              </div>
            )}
            {!isHost && snapshot.viewer.joined === false && (
              <p className={styles.scored}>
                입장이 마감됐어요. 다음 게임을 기다려 주세요.
              </p>
            )}
            {multipleChoice && (isHost || snapshot.viewer.joined !== false) && (
              <div
                className={styles.choices}
                data-song-choices
                role="group"
                aria-label={`${answerPrompt} 보기`}
              >
                {currentRound.choices?.map((choice, index) => (
                  <button
                    key={choice.id}
                    type="button"
                    className={styles.choice}
                    data-option={index}
                    data-song-choice
                    aria-pressed={snapshot.viewer.selectedChoiceId === choice.id}
                    disabled={isHost || answerDisabled}
                    onClick={() =>
                      onIntent({
                        type: "guess",
                        choiceId: choice.id,
                        roundId: currentRound.roundId,
                      })
                    }
                  >
                    <span className={styles.choiceLabel}>{choice.label}</span>
                  </button>
                ))}
              </div>
            )}
            {!multipleChoice && !isHost && snapshot.viewer.joined !== false && (
              <form
                className={styles.answerForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = guessText.trim();
                  if (
                    !text ||
                    !canInteract ||
                    expired ||
                    snapshot.viewer.scoredCurrentRound ||
                    snapshot.viewer.joined === false
                  ) {
                    return;
                  }
                  onIntent({ type: "guess", text });
                  onGuessText("");
                }}
              >
                <input
                  aria-label={answerPrompt}
                  value={guessText}
                  maxLength={200}
                  placeholder={
                    snapshot.answerTarget === "artist-title"
                      ? "가수·작곡가 - 노래 제목"
                      : "정답 입력"
                  }
                  autoComplete="off"
                  enterKeyHint="send"
                  disabled={!canInteract || expired || snapshot.viewer.scoredCurrentRound}
                  onChange={(event) => onGuessText(event.target.value)}
                />
                <button
                  className={controls.primaryButton}
                  type="submit"
                  disabled={
                    !canInteract ||
                    expired ||
                    !guessText.trim() ||
                    snapshot.viewer.scoredCurrentRound
                  }
                >
                  정답 제출
                </button>
              </form>
            )}
            {isHost && (
              <p className={styles.scored} data-song-correct-count>
                {scoredCount} / {participants.length}명 정답
              </p>
            )}
          </div>
        )}

        {roundResults && (
          <>
            <div className={styles.roundAnswer} data-song-reveal-answer>
              <div>
                <p>정답</p>
                <h2>{currentRound.revealedAnswer ?? "정답을 불러오는 중…"}</h2>
              </div>
              {studentView ? (
                <span>
                  <strong>{`+${ownParticipant?.roundScore ?? 0}`}</strong>
                  <small>점</small>
                </span>
              ) : (
                <div className={teacherStyles.revealRate}>
                  <span>이번 문제 정답</span>
                  <strong>{`${scoredCount} / ${participants.length}`}</strong>
                  <em>
                    {participants.length > 0
                      ? `${Math.round((scoredCount / participants.length) * 100)}%`
                      : "0%"}
                  </em>
                </div>
              )}
            </div>
            {studentView && multipleChoice && currentRound.choices && (
              <div
                className={styles.choices}
                data-reveal="true"
                role="group"
                aria-label={`${answerPrompt} 제출 결과`}
              >
                {currentRound.choices.map((choice, index) => {
                  const selected = snapshot.viewer.selectedChoiceId === choice.id;
                  const correct =
                    currentRound.revealedAnswer != null &&
                    normalizeSongGuessAnswer(choice.label) ===
                      normalizeSongGuessAnswer(currentRound.revealedAnswer);
                  const state = correct ? "correct" : selected ? "wrong" : "muted";
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      className={styles.choice}
                      data-option={index}
                      data-result={state}
                      aria-pressed={selected}
                      disabled
                    >
                      <span className={styles.choiceLabel}>{choice.label}</span>
                      {correct ? (
                        <span className={styles.choiceBadge}>
                          <Check
                            size={18}
                            aria-label={selected ? "정답 · 내 답" : "정답"}
                          />
                        </span>
                      ) : selected ? (
                        <X size={20} aria-label="제출한 오답" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
            {studentView && ownParticipant && (
              <div className={styles.studentRankCard}>
                <h2 className={styles.visuallyHidden}>라운드 순위</h2>
                <div>
                  <span>현재 순위</span>
                  <strong>{ownRank ?? "—"}위</strong>
                  {ownRankMovement !== 0 && (
                    <span className={styles.visuallyHidden} aria-label={`${Math.abs(ownRankMovement)}위 ${ownRankMovement > 0 ? "상승" : "하락"}`}>
                      {ownRankMovement > 0 ? "상승" : "하락"}
                    </span>
                  )}
                </div>
                <div><span>누적</span><strong>{ownParticipant.score.toLocaleString("ko-KR")}점</strong></div>
              </div>
            )}
            {isHost && <SongGuessScoreboard participants={participants} roundResults />}
          </>
        )}

        {finished && <SongGuessScoreboard participants={participants} podium />}

        {snapshot.roomMode === "student-free" && !finished && <div className={styles.hostActions}>
          {snapshot.viewer.canStart && phase === "lobby" && <button type="button" className={controls.primaryButton} disabled={!canInteract} onClick={() => onIntent({ type: "start" })}>음악 퀴즈 시작</button>}
        </div>}
        {isHost && snapshot.roomMode !== "student-free" && !finished && (
          <div className={styles.hostActions} data-song-host-actions>
            {phase === "draft" && (
              <button
                className={controls.primaryButton}
                type="button"
                disabled={!canInteract}
                onClick={() => onIntent({ type: "open_lobby" })}
              >
                로비 열기
              </button>
            )}
            {phase === "lobby" && (
              <button
                className={controls.primaryButton}
                type="button"
                disabled={!canInteract || participants.length === 0}
                onClick={() => onIntent({ type: "start" })}
              >
                음악 퀴즈 시작
              </button>
            )}
            {phase === "guessing" && (
              <>
                {currentRound.currentClip && currentRound.currentClip.tierMs < 1500 && (
                  <button
                    className={controls.secondaryButton}
                    type="button"
                    disabled={!canInteract || expired}
                    onClick={() => onIntent({ type: "unlock_clip" })}
                  >
                    다음 길이 클립 열기
                  </button>
                )}
                <button
                  className={controls.primaryButton}
                  type="button"
                  disabled={!canInteract}
                  onClick={() => onIntent({ type: "reveal" })}
                >
                  정답 공개
                </button>
              </>
            )}
            {phase === "reveal" && (
              <button
                className={controls.primaryButton}
                type="button"
                disabled={!canInteract || hasNextRound === null}
                onClick={() => {
                  if (hasNextRound !== null) {
                    onIntent({ type: hasNextRound ? "next_round" : "finish" });
                  }
                }}
              >
                {hasNextRound === null
                  ? "라운드 구성 확인 필요"
                  : hasNextRound
                    ? "다음 라운드"
                    : "게임 끝내기"}
              </button>
            )}
            {totalRounds === null && (
              <button
                className={controls.secondaryButton}
                type="button"
                disabled={!canInteract}
                onClick={onReloadSetup}
              >
                라운드 구성 다시 불러오기
              </button>
            )}
          </div>
        )}
        <div className={styles.status}>{status}</div>
      </main>
      {!finished && !roundResults && !waiting && (
        <aside className={styles.scoreboard} data-song-scoreboard>
          <SongGuessScoreboard participants={participants} liveTeacher={isHost} />
        </aside>
      )}
    </div>
  );
}
