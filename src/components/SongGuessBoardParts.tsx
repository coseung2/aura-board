"use client";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { maxSongGuessStartSeconds, SONG_GUESS_MAX_SOURCE_SIZE_BYTES } from "@/lib/song-guess/audio";
import styles from "./SongGuessBoard.module.css";
import type { RoundDraft } from "./song-guess-board-model";
import { moveRound, revokeGenerated, updateDraft } from "./song-guess-board-utils";

export function BoardHeading({
  title,
  syncing,
  version,
}: {
  title: string;
  syncing: boolean;
  version: number | null;
}) {
  return (
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>Authoritative song guess</p>
        <h1>{title || "초단위 음악 퀴즈"}</h1>
      </div>
      <span className={styles.version}>
        {version === null ? "설정" : `v${version}`} · {syncing ? "동기화 중" : "동기화됨"}
      </span>
    </header>
  );
}

export function StatusMessages({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    <>
      {notice && <p className={styles.notice} role="status" aria-live="polite">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </>
  );
}


export function SongGuessRoundEditor({ draft, index, draftCount, busy, decodingRoundId, setDrafts, onSourceFile, onPreviewSource, onGenerateClips }: {
 draft: RoundDraft; index: number; draftCount: number; busy: boolean; decodingRoundId: string | null;
 setDrafts: Dispatch<SetStateAction<RoundDraft[]>>;
 onSourceFile: (roundId: string, event: ChangeEvent<HTMLInputElement>) => Promise<void>;
 onPreviewSource: (draft: RoundDraft) => Promise<void>; onGenerateClips: (roundId: string) => void;
}) { return (

              <article className={styles.roundCard} key={draft.clientId}>
                <div className={styles.roundHeader}>
                  <h3>{index + 1}라운드</h3>
                  <div className={styles.inlineActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`${index + 1}라운드를 위로 이동`}
                      disabled={busy || index === 0}
                      onClick={() => setDrafts((current) => moveRound(current, index, index - 1))}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`${index + 1}라운드를 아래로 이동`}
                      disabled={busy || index === draftCount - 1}
                      onClick={() => setDrafts((current) => moveRound(current, index, index + 1))}

                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={styles.dangerQuietButton}
                      disabled={busy}
                      onClick={() => {
                        revokeGenerated(draft.generatedClips);
                        setDrafts((current) => current.filter((item) => item.clientId !== draft.clientId));
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>대표 정답</span>
                    <input
                      value={draft.representativeAnswer}
                      maxLength={200}
                      onChange={(event) => updateDraft(setDrafts, draft.clientId, { representativeAnswer: event.target.value })}
                      placeholder="예: Dynamite"
                    />
                  </label>
                  <label className={styles.field}>
                    <span>허용 별칭</span>
                    <textarea
                      value={draft.aliasesText}
                      maxLength={1200}
                      onChange={(event) => updateDraft(setDrafts, draft.clientId, { aliasesText: event.target.value })}
                      placeholder="쉼표 또는 줄바꿈으로 구분"
                      rows={3}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>접근성 단서 (선택)</span>
                    <textarea
                      value={draft.accessibilityClue}
                      maxLength={500}
                      onChange={(event) => updateDraft(setDrafts, draft.clientId, { accessibilityClue: event.target.value })}
                      placeholder="청각 정보만으로 참여하기 어려운 학생을 위한 단서"
                      rows={2}
                    />
                  </label>
                </div>

                <div className={styles.audioWorkbench}>
                  <label className={styles.filePicker}>
                    <span>{draft.existingClipAssetIds ? "음원 교체" : "내 컴퓨터에서 음원 선택"}</span>
                    <input
                      type="file"
                      accept="audio/*"
                      disabled={busy || decodingRoundId === draft.clientId}
                      onChange={(event) => void onSourceFile(draft.clientId, event)}
                    />
                  </label>
                  <p className={styles.helperText}>
                    최대 {Math.round(SONG_GUESS_MAX_SOURCE_SIZE_BYTES / 1024 / 1024)}MB. 원본 파일명과 원본 바이트는 서버 요청에 포함되지 않습니다.
                  </p>

                  {draft.sourceBuffer && (
                    <div className={styles.trimPanel}>
                      <div className={styles.sourceMeta}>
                        <strong>{draft.sourceName}</strong>
                        <span>{draft.sourceBuffer.duration.toFixed(2)}초</span>
                      </div>
                      <label className={styles.field}>
                        <span>시작 지점</span>
                        <div className={styles.rangeRow}>
                          <input
                            type="range"
                            min={0}
                            max={maxSongGuessStartSeconds(draft.sourceBuffer)}
                            step={0.01}
                            value={draft.startSeconds}
                            onChange={(event) => {
                              revokeGenerated(draft.generatedClips);
                              updateDraft(setDrafts, draft.clientId, {
                                startSeconds: Number(event.target.value),
                                generatedClips: null,
                              });
                            }}
                          />
                          <input
                            className={styles.numberInput}
                            type="number"
                            min={0}
                            max={maxSongGuessStartSeconds(draft.sourceBuffer)}
                            step={0.01}
                            value={draft.startSeconds}
                            onChange={(event) => {
                              revokeGenerated(draft.generatedClips);
                              updateDraft(setDrafts, draft.clientId, {
                                startSeconds: Number(event.target.value),
                                generatedClips: null,
                              });
                            }}
                            aria-label={`${index + 1}라운드 시작 초`}
                          />
                          <span>초</span>
                        </div>
                      </label>
                      <div className={styles.inlineActions}>
                        <button type="button" className={styles.secondaryButton} onClick={() => void onPreviewSource(draft)}>
                          선택 구간 1.5초 듣기
                        </button>
                        <button type="button" className={styles.primaryButton} onClick={() => onGenerateClips(draft.clientId)}>
                          3개 파생 클립 만들기
                        </button>
                      </div>
                    </div>
                  )}

                  {draft.existingClipAssetIds && !draft.generatedClips && (
                    <div className={styles.savedClipSummary}>
                      <strong>저장된 파생 클립</strong>
                      <span>{draft.existingClipSummary.map((clip) => `${clip.tierMs / 1000}초`).join(" · ")}</span>
                    </div>
                  )}

                  {draft.generatedClips && (
                    <div className={styles.previewGrid} aria-label={`${index + 1}라운드 파생 클립 미리듣기`}>
                      {draft.generatedClips.map((clip) => (
                        <label className={styles.previewItem} key={clip.tierMs}>
                          <span>{clip.tierMs / 1000}초</span>
                          <audio controls preload="metadata" src={clip.url} />
                        </label>
                      ))}
                    </div>
                  )}

                  {(draft.generatedClips || (!draft.existingClipAssetIds && draft.sourceBuffer)) && (
                    <label className={styles.rightsCheck}>
                      <input
                        type="checkbox"
                        checked={draft.rightsConfirmed}
                        onChange={(event) => updateDraft(setDrafts, draft.clientId, { rightsConfirmed: event.target.checked })}
                      />
                      <span>이 음원을 수업에서 사용할 권한이 있으며, 파생 클립 저장에 동의합니다.</span>
                    </label>
                  )}
                </div>
              </article>

 ); }
