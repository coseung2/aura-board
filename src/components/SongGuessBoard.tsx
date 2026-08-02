"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { boardChannelKey, PLAY_SESSION_CHANGED_EVENT } from "@/lib/realtime";
import {
  createSongGuessSession,
  deleteSongGuessClip,
  deleteSongGuessTeacherSetup,
  fetchCurrentSongGuessSession,
  fetchSongGuessTeacherSetup,
  makeSongGuessCommand,
  saveSongGuessTeacherSetup,
  songGuessClipUrl,
  SongGuessClientError,
  submitSongGuessCommand,
  uploadSongGuessClip,
} from "@/lib/song-guess/browser-client";
import {
  isSongGuessSnapshot,
  mergeSongGuessSnapshot,
  type SongGuessClipTierMs,
  type SongGuessCommandRequest,
  type SongGuessGuessResult,
  type SongGuessIntent,
  type SongGuessSnapshot,
  type SongGuessTeacherSetup,
} from "@/lib/song-guess/contracts";
import {
  createSongGuessWavClips,
  maxSongGuessStartSeconds,
  SONG_GUESS_MAX_SOURCE_DURATION_SECONDS,
  SONG_GUESS_MAX_SOURCE_SIZE_BYTES,
  validateSongGuessDecodedAudio,
  validateSongGuessSourceFile,
} from "@/lib/song-guess/audio";
import {
  persistSongGuessRoundPack,
  type SongGuessRoundSaveDraft,
} from "@/lib/song-guess/teacher-workflow";
import styles from "./SongGuessBoard.module.css";

type Props = {
  boardId: string;
  boardTitle: string;
  viewer: "teacher" | "student";
};

type PendingCommand = {
  sessionId: string;
  request: SongGuessCommandRequest;
};

type GeneratedClipDraft = {
  tierMs: SongGuessClipTierMs;
  blob: Blob;
  url: string;
};

type RoundDraft = {
  clientId: string;
  representativeAnswer: string;
  aliasesText: string;
  accessibilityClue: string;
  rightsConfirmed: boolean;
  existingClipAssetIds: [string, string, string] | null;
  existingClipSummary: Array<{
    tierMs: number;
    durationMs: number;
    sizeBytes: number;
  }>;
  sourceBuffer: AudioBuffer | null;
  sourceName: string | null;
  startSeconds: number;
  generatedClips: GeneratedClipDraft[] | null;
};

export function SongGuessBoard({ boardId, boardTitle, viewer }: Props) {
  const [snapshot, setSnapshot] = useState<SongGuessSnapshot | null>(null);
  const [setup, setSetup] = useState<SongGuessTeacherSetup | null>(null);
  const [drafts, setDrafts] = useState<RoundDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decodingRoundId, setDecodingRoundId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [guessText, setGuessText] = useState("");
  const [lastGuessResult, setLastGuessResult] = useState<SongGuessGuessResult | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const sessionSequence = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const draftsRef = useRef<RoundDraft[]>([]);
  const autoRetriedRequest = useRef<string | null>(null);
  const storageKey = `aura-song-guess-pending:${boardId}`;

  draftsRef.current = drafts;

  const readPending = useCallback((): PendingCommand | null => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const value = JSON.parse(raw) as PendingCommand;
      if (
        !value ||
        typeof value.sessionId !== "string" ||
        !value.request ||
        typeof value.request.requestId !== "string" ||
        !Number.isSafeInteger(value.request.expectedVersion)
      ) {
        window.localStorage.removeItem(storageKey);
        return null;
      }
      return value;
    } catch {
      return null;
    }
  }, [storageKey]);

  const clearPending = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Storage can be unavailable in private browser contexts.
    }
    setHasPending(false);
  }, [storageKey]);

  const refreshSession = useCallback(async () => {
    const sequence = ++sessionSequence.current;
    setSyncing(true);
    try {
      const next = await fetchCurrentSongGuessSession(boardId);
      if (sequence !== sessionSequence.current) return;
      setSnapshot((current) => {
        if (!next) return null;
        if (!current || current.sessionId !== next.sessionId) return next;
        return mergeSongGuessSnapshot(current, next.sessionId, next);
      });
      setError(null);
      const pending = readPending();
      setHasPending(!!pending && pending.sessionId === next?.sessionId);
    } catch (cause) {
      if (sequence === sessionSequence.current) setError(messageForError(cause));
    } finally {
      if (sequence === sessionSequence.current) setSyncing(false);
    }
  }, [boardId, readPending]);

  const reloadSetup = useCallback(async () => {
    if (viewer !== "teacher") return;
    try {
      const next = await fetchSongGuessTeacherSetup(boardId);
      revokeDraftUrls(draftsRef.current);
      setSetup(next);
      setDrafts(next ? draftsFromSetup(next) : [emptyRoundDraft()]);
      setSetupError(null);
    } catch (cause) {
      setSetupError(messageForError(cause));
    }
  }, [boardId, viewer]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      refreshSession(),
      viewer === "teacher" ? reloadSetup() : Promise.resolve(),
    ]).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refreshSession, reloadSetup, viewer]);

  useRealtimeInvalidation({
    channelName: boardChannelKey(boardId),
    event: PLAY_SESSION_CHANGED_EVENT,
    refresh: refreshSession,
    fallbackPollMs: 10_000,
  });

  useEffect(() => {
    return () => {
      stopSourcePreview(sourceNodeRef);
      revokeDraftUrls(draftsRef.current);
      void audioContextRef.current?.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    setLastGuessResult(null);
    setGuessText("");
  }, [snapshot?.currentRound.roundId]);

  const executeCommand = useCallback(
    async (pending: PendingCommand, persist = true) => {
      if (persist) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(pending));
        } catch {
          // In-memory request still retains the exact idempotency key.
        }
      }
      setHasPending(true);
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const response = await submitSongGuessCommand(pending.sessionId, pending.request);
        setSnapshot((current) =>
          mergeSongGuessSnapshot(current, pending.sessionId, response.snapshot),
        );
        if (response.result) setLastGuessResult(response.result);
        clearPending();
      } catch (cause) {
        if (cause instanceof SongGuessClientError) {
          const recovered = cause.body.snapshot;
          if (cause.status === 409 && isSongGuessSnapshot(recovered)) {
            setSnapshot((current) =>
              mergeSongGuessSnapshot(current, pending.sessionId, recovered),
            );
            clearPending();
            setNotice("다른 화면에서 상태가 먼저 바뀌어 최신 게임으로 동기화했어요.");
            return;
          }
          if (cause.status < 500 && cause.status !== 408) clearPending();
        }
        setError(messageForError(cause));
      } finally {
        setBusy(false);
      }
    },
    [clearPending, storageKey],
  );

  useEffect(() => {
    if (!snapshot || busy) return;
    const pending = readPending();
    if (
      !pending ||
      pending.sessionId !== snapshot.sessionId ||
      autoRetriedRequest.current === pending.request.requestId
    ) {
      return;
    }
    autoRetriedRequest.current = pending.request.requestId;
    void executeCommand(pending, false);
  }, [busy, executeCommand, readPending, snapshot]);

  const sendIntent = useCallback(
    (command: SongGuessIntent) => {
      if (!snapshot || busy || syncing) return;
      void executeCommand({
        sessionId: snapshot.sessionId,
        request: makeSongGuessCommand(snapshot, command),
      });
    },
    [busy, executeCommand, snapshot, syncing],
  );

  const currentTeacherRound = useMemo(
    () => setup?.rounds.find((round) => round.order === snapshot?.currentRound.order) ?? null,
    [setup, snapshot?.currentRound.order],
  );

  async function createSession() {
    if (!setup?.rounds.length || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await createSongGuessSession(boardId);
      setSnapshot(response.snapshot);
      setNotice("게임 세션을 만들었어요. 로비를 열면 학생 화면에 나타납니다.");
    } catch (cause) {
      if (cause instanceof SongGuessClientError && cause.status === 409) {
        await refreshSession();
        return;
      }
      setError(messageForError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleSourceFile(roundId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    const fileError = validateSongGuessSourceFile(file);
    if (fileError) {
      setError(messageForAudioError(fileError));
      return;
    }
    setDecodingRoundId(roundId);
    setError(null);
    setNotice("원본은 브라우저 메모리에서만 해석하며 서버로 보내지 않습니다.");
    try {
      const sourceDuration = await readLocalAudioDuration(file);
      if (sourceDuration < 1.5) throw new Error("source_audio_too_short");
      if (sourceDuration > SONG_GUESS_MAX_SOURCE_DURATION_SECONDS) {
        throw new Error("source_audio_too_long");
      }
      const context = await getAudioContext(audioContextRef);
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      const decodedError = validateSongGuessDecodedAudio(decoded);
      if (decodedError) throw new Error(decodedError);
      setDrafts((current) =>
        current.map((draft) => {
          if (draft.clientId !== roundId) return draft;
          revokeGenerated(draft.generatedClips);
          return {
            ...draft,
            sourceBuffer: decoded,
            sourceName: file.name,
            startSeconds: 0,
            generatedClips: null,
            rightsConfirmed: false,
          };
        }),
      );
    } catch (cause) {
      setError(messageForAudioError(cause instanceof Error ? cause.message : "decode_failed"));
    } finally {
      setDecodingRoundId(null);
    }
  }

  async function previewSource(draft: RoundDraft) {
    if (!draft.sourceBuffer) return;
    setError(null);
    try {
      const context = await getAudioContext(audioContextRef);
      stopSourcePreview(sourceNodeRef);
      const node = context.createBufferSource();
      node.buffer = draft.sourceBuffer;
      node.connect(context.destination);
      node.onended = () => {
        if (sourceNodeRef.current === node) sourceNodeRef.current = null;
      };
      sourceNodeRef.current = node;
      node.start(0, draft.startSeconds, 1.5);
    } catch {
      setError("미리듣기를 재생하지 못했어요. 브라우저 오디오 권한을 확인해 주세요.");
    }
  }

  function generateClips(roundId: string) {
    const draft = drafts.find((candidate) => candidate.clientId === roundId);
    if (!draft?.sourceBuffer) {
      setError("먼저 내 컴퓨터의 음원 파일을 선택해 주세요.");
      return;
    }
    try {
      const generated = createSongGuessWavClips(draft.sourceBuffer, draft.startSeconds).map(
        (clip) => {
          const bytes = clip.bytes.slice();
          const blob = new Blob([bytes], { type: clip.mimeType });
          return {
            tierMs: clip.tierMs,
            blob,
            url: URL.createObjectURL(blob),
          };
        },
      );
      setDrafts((current) =>
        current.map((candidate) => {
          if (candidate.clientId !== roundId) return candidate;
          revokeGenerated(candidate.generatedClips);
          return { ...candidate, generatedClips: generated };
        }),
      );
      setError(null);
      setNotice("0.5초·1.0초·1.5초 WAV 파생본을 만들었어요. 각각 들어본 뒤 저장하세요.");
    } catch (cause) {
      setError(messageForAudioError(cause instanceof Error ? cause.message : "clip_generation_failed"));
    }
  }

  async function savePack() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice("파생 클립과 라운드 순서를 저장하는 중이에요…");
    try {
      const workflowDrafts: SongGuessRoundSaveDraft[] = drafts.map((draft) => ({
        representativeAnswer: draft.representativeAnswer,
        aliasesText: draft.aliasesText,
        accessibilityClue: draft.accessibilityClue,
        rightsConfirmed: draft.rightsConfirmed,
        existingClipAssetIds: draft.existingClipAssetIds,
        generatedClips: draft.generatedClips?.map((clip) => ({
          tierMs: clip.tierMs,
          blob: clip.blob,
        })) ?? null,
        sourceSelected: draft.sourceBuffer !== null,
      }));
      const saved = await persistSongGuessRoundPack(boardId, workflowDrafts, {
        uploadClip: uploadSongGuessClip,
        saveSetup: saveSongGuessTeacherSetup,
        cleanupClip: deleteSongGuessClip,
      });
      revokeDraftUrls(draftsRef.current);
      setSetup(saved);
      setSetupError(null);
      setDrafts(draftsFromSetup(saved));
      setNotice("저장됐어요. 원본 파일은 업로드되지 않았고 파생 클립만 보관됩니다.");
    } catch (cause) {
      if (
        cause instanceof SongGuessClientError &&
        cause.body.error === "song_guess_setup_locked"
      ) {
        await refreshSession();
      }
      setError(messageForError(cause));
      setNotice(null);
    } finally {
      setBusy(false);
    }
  }

  async function removeSetup() {
    if (busy || !setup) return;
    if (!window.confirm("저장된 모든 라운드와 파생 클립을 삭제할까요?")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSongGuessTeacherSetup(boardId);
      revokeDraftUrls(draftsRef.current);
      setSetup(null);
      setSetupError(null);
      setDrafts([emptyRoundDraft()]);
      setNotice("저장된 음악 퀴즈 구성을 삭제했어요.");
    } catch (cause) {
      setError(messageForError(cause));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className={styles.shell} aria-label={boardTitle}>
        <div className={styles.panel} role="status">음악 퀴즈를 불러오는 중이에요…</div>
      </section>
    );
  }

  if (!snapshot && viewer === "teacher") {
    return (
      <section className={styles.shell} aria-label={boardTitle}>
        <BoardHeading title={boardTitle} syncing={syncing} version={null} />
        <div className={styles.editorLayout}>
          <main className={styles.editorMain}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Teacher pack</p>
                <h2>라운드 음원 준비</h2>
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setDrafts((current) => [...current, emptyRoundDraft()])}
                disabled={busy || drafts.length >= 50}
              >
                노래 추가
              </button>
            </div>

            {drafts.map((draft, index) => (
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
                      disabled={busy || index === drafts.length - 1}
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
                      onChange={(event) => void handleSourceFile(draft.clientId, event)}
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
                        <button type="button" className={styles.secondaryButton} onClick={() => void previewSource(draft)}>
                          선택 구간 1.5초 듣기
                        </button>
                        <button type="button" className={styles.primaryButton} onClick={() => generateClips(draft.clientId)}>
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
            ))}
          </main>

          <aside className={styles.editorSidebar}>
            <div className={styles.sidebarCard}>
              <h2>저장 및 시작</h2>
              <p>라운드 순서대로 세 개의 짧은 파생 클립과 정답 규칙만 저장합니다.</p>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={busy || drafts.length === 0}
                onClick={() => void savePack()}
              >
                {busy ? "저장 중…" : "라운드 팩 저장"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy || !setup?.rounds.length}
                onClick={() => void createSession()}
              >
                게임 세션 만들기
              </button>
              {setup && (
                <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => void removeSetup()}>
                  저장 구성 삭제
                </button>
              )}
            </div>
            <StatusMessages error={error ?? setupError} notice={notice} />
          </aside>
        </div>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className={styles.shell} aria-label={boardTitle}>
        <BoardHeading title={boardTitle} syncing={syncing} version={null} />
        <div className={styles.panel}>
          <h2>게임 준비 중</h2>
          <p>교사가 라운드 팩을 저장하고 게임 세션을 만들면 자동으로 표시됩니다.</p>
          <button className={styles.secondaryButton} type="button" onClick={() => void refreshSession()} disabled={syncing}>
            최신 상태 확인
          </button>
          <StatusMessages error={error ?? setupError} notice={notice} />
        </div>
      </section>
    );
  }

  const currentClip = snapshot.currentRound.currentClip;
  const isHost = snapshot.viewer.role === "host";
  const canInteract = !busy && !syncing;
  const hasNextRound = setup
    ? snapshot.currentRound.order + 1 < setup.rounds.length
    : null;

  return (
    <section className={styles.shell} aria-label={boardTitle}>
      <BoardHeading title={boardTitle} syncing={syncing} version={snapshot.version} />
      <div className={styles.gameLayout}>
        <main className={styles.gameMain}>
          <div className={styles.phaseCard}>
            <div>
              <p className={styles.eyebrow}>{phaseLabel(snapshot.phase)}</p>
              <h2>{snapshot.currentRound.order + 1}라운드</h2>
            </div>
            <span className={styles.roleBadge}>{isHost ? "교사 진행자" : "참가자"}</span>
          </div>

          {snapshot.currentRound.accessibilityClue && (
            <div className={styles.clueCard}>
              <strong>접근성 단서</strong>
              <p>{snapshot.currentRound.accessibilityClue}</p>
            </div>
          )}

          {snapshot.phase === "draft" && (
            <div className={styles.stageMessage}>교사가 로비를 열기 전입니다.</div>
          )}
          {snapshot.phase === "lobby" && (
            <div className={styles.stageMessage}>참가자 입장을 기다리고 있어요.</div>
          )}

          {currentClip && snapshot.phase === "guessing" && (
            <div className={styles.playerCard}>
              <div>
                <p className={styles.eyebrow}>현재 열린 클립</p>
                <h3>{currentClip.tierMs / 1000}초 듣기</h3>
              </div>
              <audio
                key={currentClip.assetId}
                controls
                preload="none"
                src={songGuessClipUrl(snapshot.sessionId, currentClip.assetId)}
                aria-label={`${currentClip.tierMs / 1000}초 음악 클립`}
              />
              <p className={styles.helperText}>재생은 직접 눌러야 하며 자동 재생하지 않습니다.</p>
            </div>
          )}

          {!isHost && snapshot.phase === "guessing" && (
            <form
              className={styles.guessForm}
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                const text = guessText.trim();
                if (!text || !canInteract) return;
                sendIntent({ type: "guess", text });
                setGuessText("");
              }}
            >
              <label className={styles.field}>
                <span>노래 제목</span>
                <input
                  value={guessText}
                  maxLength={200}
                  disabled={!canInteract || snapshot.viewer.scoredCurrentRound}
                  onChange={(event) => setGuessText(event.target.value)}
                  placeholder="정답 입력"
                  autoComplete="off"
                />
              </label>
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={!canInteract || !guessText.trim() || snapshot.viewer.scoredCurrentRound}
              >
                정답 제출
              </button>
            </form>
          )}

          {lastGuessResult && (
            <div className={lastGuessResult.correct ? styles.correctResult : styles.wrongResult} role="status" aria-live="polite">
              {lastGuessResult.alreadyScored
                ? "이 라운드는 이미 점수를 받았어요."
                : lastGuessResult.correct
                  ? `정답! 서버가 ${lastGuessResult.score}점을 반영했어요.`
                  : "아직 정답이 아니에요. 다시 들어보고 도전해 보세요."}
            </div>
          )}

          {snapshot.phase === "reveal" && (
            <div className={styles.revealCard}>
              <p className={styles.eyebrow}>Round reveal</p>
              <h3>{snapshot.currentRound.revealedAnswer ?? currentTeacherRound?.representativeAnswer ?? "정답 공개를 동기화하는 중이에요"}</h3>
              <p>{isHost ? "점수를 확인한 뒤 다음 라운드로 진행하세요." : "점수판에서 누적 점수를 확인해 보세요."}</p>
            </div>
          )}

          {snapshot.phase === "finished" && (
            <div className={styles.revealCard}>
              <p className={styles.eyebrow}>Finished</p>
              <h3>음악 퀴즈 종료</h3>
              <p>최종 점수는 서버에 확정된 누적 점수입니다.</p>
            </div>
          )}
        </main>

        <aside className={styles.gameSidebar}>
          <div className={styles.sidebarCard}>
            <h2>점수판</h2>
            <ol className={styles.scoreList}>
              {[...snapshot.participants]
                .sort((left, right) => right.score - left.score || left.displayName.localeCompare(right.displayName))
                .map((participant, index) => (
                  <li key={`${participant.displayName}-${index}`}>
                    <span>{participant.displayName}</span>
                    <strong>{participant.score}점</strong>
                  </li>
                ))}
            </ol>
          </div>

          {isHost && (
            <div className={styles.sidebarCard}>
              <h2>진행 제어</h2>
              {snapshot.phase === "draft" && (
                <button className={styles.primaryButton} type="button" disabled={!canInteract} onClick={() => sendIntent({ type: "open_lobby" })}>
                  로비 열기
                </button>
              )}
              {snapshot.phase === "lobby" && (
                <button className={styles.primaryButton} type="button" disabled={!canInteract} onClick={() => sendIntent({ type: "start" })}>
                  첫 클립 열고 시작
                </button>
              )}
              {snapshot.phase === "guessing" && (
                <>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    disabled={!canInteract || currentClip?.tierMs === 1500}
                    onClick={() => sendIntent({ type: "unlock_clip" })}
                  >
                    다음 길이 클립 열기
                  </button>
                  <button className={styles.primaryButton} type="button" disabled={!canInteract} onClick={() => sendIntent({ type: "reveal" })}>
                    정답 공개
                  </button>
                </>
              )}
              {snapshot.phase === "reveal" && (
                <button
                  className={styles.primaryButton}
                  type="button"
                  disabled={!canInteract || hasNextRound === null}
                  onClick={() => {
                    if (hasNextRound === null) return;
                    sendIntent({ type: hasNextRound ? "next_round" : "finish" });
                  }}
                >
                  {hasNextRound === null
                    ? "라운드 구성 확인 필요"
                    : hasNextRound
                      ? "다음 라운드"
                      : "게임 끝내기"}
                </button>
              )}
              {!setup && (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={busy}
                  onClick={() => void reloadSetup()}
                >
                  라운드 구성 다시 불러오기
                </button>
              )}
              <p className={styles.helperText}>세션이 존재하는 동안 라운드 편집은 잠깁니다.</p>
            </div>
          )}

          <div className={styles.sidebarCard}>
            <button className={styles.secondaryButton} type="button" disabled={busy || syncing} onClick={() => void refreshSession()}>
              최신 상태 확인
            </button>
            {hasPending && (
              <button
                className={styles.secondaryButton}
                type="button"
                disabled={busy}
                onClick={() => {
                  const pending = readPending();
                  if (pending) void executeCommand(pending, false);
                }}
              >
                미확인 요청 같은 ID로 다시 보내기
              </button>
            )}
          </div>
          <StatusMessages error={error ?? setupError} notice={notice} />
        </aside>
      </div>
    </section>
  );
}

function BoardHeading({
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

function StatusMessages({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    <>
      {notice && <p className={styles.notice} role="status" aria-live="polite">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </>
  );
}

function emptyRoundDraft(): RoundDraft {
  return {
    clientId: createClientId(),
    representativeAnswer: "",
    aliasesText: "",
    accessibilityClue: "",
    rightsConfirmed: false,
    existingClipAssetIds: null,
    existingClipSummary: [],
    sourceBuffer: null,
    sourceName: null,
    startSeconds: 0,
    generatedClips: null,
  };
}

function draftsFromSetup(setup: SongGuessTeacherSetup): RoundDraft[] {
  return setup.rounds.map((round) => {
    const clips = [...round.clips].sort((left, right) => left.tierMs - right.tierMs);
    return {
      clientId: `saved-${round.id}`,
      representativeAnswer: round.representativeAnswer,
      aliasesText: round.aliases.join(", "),
      accessibilityClue: round.accessibilityClue ?? "",
      rightsConfirmed: false,
      existingClipAssetIds: clips.map((clip) => clip.id) as [string, string, string],
      existingClipSummary: clips.map((clip) => ({
        tierMs: clip.tierMs,
        durationMs: clip.durationMs,
        sizeBytes: clip.sizeBytes,
      })),
      sourceBuffer: null,
      sourceName: null,
      startSeconds: 0,
      generatedClips: null,
    };
  });
}

function updateDraft(
  setDrafts: React.Dispatch<React.SetStateAction<RoundDraft[]>>,
  clientId: string,
  patch: Partial<RoundDraft>,
) {
  setDrafts((current) =>
    current.map((draft) => (draft.clientId === clientId ? { ...draft, ...patch } : draft)),
  );
}

function moveRound(drafts: RoundDraft[], from: number, to: number): RoundDraft[] {
  if (from === to || to < 0 || to >= drafts.length) return drafts;
  const next = [...drafts];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function revokeGenerated(clips: GeneratedClipDraft[] | null): void {
  for (const clip of clips ?? []) URL.revokeObjectURL(clip.url);
}

function revokeDraftUrls(drafts: readonly RoundDraft[]): void {
  for (const draft of drafts) revokeGenerated(draft.generatedClips);
}

function createClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `round-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readLocalAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      audio.removeEventListener("loadedmetadata", handleMetadata);
      audio.removeEventListener("error", handleError);
      audio.removeAttribute("src");
      URL.revokeObjectURL(objectUrl);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleMetadata = () => {
      const duration = audio.duration;
      finish(() => {
        if (!Number.isFinite(duration) || duration <= 0) reject(new Error("invalid_source_metadata"));
        else resolve(duration);
      });
    };
    const handleError = () => finish(() => reject(new Error("decode_failed")));
    const timeout = window.setTimeout(
      () => finish(() => reject(new Error("decode_failed"))),
      15_000,
    );
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", handleMetadata);
    audio.addEventListener("error", handleError);
    audio.src = objectUrl;
  });
}

async function getAudioContext(
  reference: React.MutableRefObject<AudioContext | null>,
): Promise<AudioContext> {
  let context = reference.current;
  if (!context) {
    context = new AudioContext({ latencyHint: "interactive" });
    reference.current = context;
  }
  if (context.state === "suspended") await context.resume();
  return context;
}

function stopSourcePreview(reference: React.MutableRefObject<AudioBufferSourceNode | null>) {
  const node = reference.current;
  reference.current = null;
  if (!node) return;
  try {
    node.stop();
  } catch {
    // The node may already have ended.
  }
  try {
    node.disconnect();
  } catch {
    // No-op after browser cleanup.
  }
}

function phaseLabel(phase: SongGuessSnapshot["phase"]): string {
  switch (phase) {
    case "draft":
      return "세션 준비";
    case "lobby":
      return "로비";
    case "guessing":
      return "정답 입력";
    case "reveal":
      return "정답 공개";
    case "finished":
      return "종료";
  }
}

function messageForAudioError(code: string): string {
  switch (code) {
    case "empty_source_file":
      return "빈 음원 파일은 사용할 수 없어요.";
    case "source_file_too_large":
      return "음원 파일이 너무 커요. 30MB 이하 파일을 선택해 주세요.";
    case "source_audio_too_short":
      return "1.5초보다 짧은 음원은 사용할 수 없어요.";
    case "source_audio_too_long":
      return "15분을 넘는 음원은 브라우저 메모리 보호를 위해 사용할 수 없어요.";
    case "invalid_source_metadata":
    case "invalid_decoded_audio":
    case "decode_failed":
      return "브라우저가 이 음원을 해석하지 못했어요. 다른 오디오 파일을 선택해 주세요.";
    case "start_too_close_to_end":
      return "시작 지점 뒤에 1.5초 분량이 남도록 조정해 주세요.";
    default:
      return `파생 클립을 만들지 못했어요 (${code}).`;
  }
}

function messageForError(error: unknown): string {
  if (error instanceof SongGuessClientError) {
    switch (error.body.error) {
      case "song_guess_setup_locked":
        return "현재 게임 세션이 있어 라운드 편집이 잠겼어요.";
      case "song_guess_clip_assigned":
        return "이미 저장된 라운드의 클립은 개별 정리할 수 없어요.";
      case "song_guess_clip_assignment_conflict":
        return "임시 클립 정리와 저장이 겹쳤어요. 라운드 구성을 다시 확인해 주세요.";
      case "invalid_phase":
      case "domain_rejected":
        return "지금 단계에서는 그 동작을 할 수 없어요. 최신 상태를 확인해 주세요.";
      case "forbidden":
        return "이 음악 퀴즈를 조작할 권한이 없어요.";
      case "play_engine_unavailable":
        return "게임 서버에 연결할 수 없어요. 미확인 요청은 같은 ID로 다시 보낼 수 있어요.";
      case "idempotency_key_reuse":
        return "요청 식별자가 충돌했어요. 최신 상태에서 다시 시도해 주세요.";
      default:
        return `음악 퀴즈 요청을 처리하지 못했어요 (${error.body.error}).`;
    }
  }
  if (error instanceof Error) {
    switch (error.message) {
      case "rights_confirmation_required":
        return "새 파생 클립을 저장하려면 음원 사용 권한을 확인해 주세요.";
      case "clips_not_generated":
        return "선택한 시작 지점으로 세 개의 파생 클립을 먼저 만들어 주세요.";
      case "audio_source_required":
        return "모든 라운드에 음원 또는 저장된 파생 클립이 필요해요.";
      case "representative_answer_required":
        return "모든 라운드의 대표 정답을 입력해 주세요.";
      case "representative_answer_too_long":
      case "alias_too_long":
      case "too_many_aliases":
      case "accessibility_clue_too_long":
        return "정답, 별칭, 접근성 단서의 길이와 개수를 확인해 주세요.";
      case "three_clips_required":
        return "각 라운드에는 0.5초·1.0초·1.5초 WAV 파생 클립이 모두 필요해요.";
      case "round_required":
        return "한 곡 이상 추가해 주세요.";
      case "too_many_rounds":
        return "라운드는 최대 50개까지 저장할 수 있어요.";
      default:
        if (error.message.startsWith("invalid_")) return `입력값을 확인해 주세요 (${error.message}).`;
    }
  }
  return "네트워크 연결을 확인해 주세요. 업로드에 실패한 임시 파생 클립은 정리되고 다시 시도할 수 있어요.";
}
