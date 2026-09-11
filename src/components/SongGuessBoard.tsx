"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { boardChannelKey, PLAY_SESSION_CHANGED_EVENT } from "@/lib/realtime";
import {
  createSongGuessSession,
  deleteSongGuessClip,
  deleteSongGuessTeacherSetup,
  fetchSongGuessSnapshot,
  fetchSongGuessTeacherSetup,
  makeSongGuessCommand,
  saveSongGuessTeacherSetup,
  SongGuessClientError,
  submitSongGuessCommand,
  uploadSongGuessClip,
} from "@/lib/song-guess/browser-client";
import {
  isSongGuessSnapshot,
  type SongGuessAnswerTarget,
  mergeSongGuessSnapshot,
  type SongGuessCommandRequest,
  type SongGuessGuessResult,
  type SongGuessIntent,
  type SongGuessSnapshot,
  type SongGuessTeacherSetup,
} from "@/lib/song-guess/contracts";
import {
  createSongGuessHighlight,
  SONG_GUESS_MAX_SOURCE_DURATION_SECONDS,
  validateSongGuessDecodedAudio,
  validateSongGuessSourceFile,
} from "@/lib/song-guess/audio";
import {
  persistSongGuessRoundPack,
  type SongGuessRoundSaveDraft,
} from "@/lib/song-guess/teacher-workflow";
import styles from "./SongGuessBoard.module.css";
import teacherStyles from "./SongGuessTeacher.module.css";
import type { RoundDraft } from "./song-guess-board-model";
import { useSongGuessClock } from "./use-song-guess-clock";
import { SongGuessPoolPicker } from "./SongGuessPoolPicker";
import { SongGuessGame } from "./SongGuessGame";
import { SongGuessAnswerGuide } from "./SongGuessAnswerGuide";
import { SongGuessImportPanel } from "./SongGuessImportPanel";
import { SongGuessSetupControls } from "./SongGuessSetupControls";
import { SongGuessRooms } from "./song-guess-rooms";
import {
  BoardHeading,
  SongGuessRoundEditor,
  StatusMessages,
} from "./SongGuessBoardParts";
import {
  draftsFromSetup,
  emptyRoundDraft,
  getAudioContext,
  messageForAudioError,
  messageForError,
  readLocalAudioDuration,
  revokeDraftUrls,
  revokeGenerated,
  stopSourcePreview,
} from "./song-guess-board-utils";

type Props = {
  boardId: string;
  boardTitle: string;
  viewer: "teacher" | "student";
};

type PendingCommand = {
  sessionId: string;
  request: SongGuessCommandRequest;
};

export function SongGuessBoard({ boardId, boardTitle, viewer }: Props) {
  const [snapshot, setSnapshot] = useState<SongGuessSnapshot | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [teacherSetup, setTeacherSetup] = useState(false);
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
  const [failedJoinSessionId, setFailedJoinSessionId] = useState<string | null>(null);
  const [customEditor, setCustomEditor] = useState(false);
  const [answerMode, setAnswerMode] = useState<"text" | "multiple-choice">("text");
  const [answerTarget, setAnswerTarget] = useState<SongGuessAnswerTarget>("title");
  const sessionSequence = useRef(0);
  const historySession = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const draftsRef = useRef<RoundDraft[]>([]);
  const autoRetriedRequest = useRef<string | null>(null);
  const commandInFlight = useRef(false);
  const storageKey = `aura-song-guess-pending:${boardId}`;
  const { remainingSeconds, expired } = useSongGuessClock(snapshot);
  const entryFailed =
    failedJoinSessionId === snapshot?.sessionId &&
    snapshot?.viewer.joined === false &&
    !busy;

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
      const next = selectedSessionId ? await fetchSongGuessSnapshot(selectedSessionId) : null;
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
  }, [selectedSessionId, readPending]);

  useEffect(() => {
    if (snapshot?.roomMode !== "student-free" || snapshot.phase === "finished") return;
    const timer = setInterval(() => void refreshSession(), 2000);
    return () => clearInterval(timer);
  }, [snapshot?.roomMode, snapshot?.phase, refreshSession]);

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
      if (commandInFlight.current) return;
      commandInFlight.current = true;
      if (pending.request.command.type === "join") setFailedJoinSessionId(null);
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
        if (pending.request.command.type === "leave" || (pending.request.command.type === "finish" && response.snapshot.roomMode === "student-free")) {
          ++sessionSequence.current;
          setSelectedSessionId(null); setSnapshot(null); setTeacherSetup(false);
        }
      } catch (cause) {
        if (pending.request.command.type === "join") {
          setFailedJoinSessionId(pending.sessionId);
        }
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
        commandInFlight.current = false;
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
      if (command.type === "finish" && !window.confirm("게임을 끝낼까요? 모든 참여자의 게임이 종료돼요.")) return;
      if (
        !snapshot ||
        busy ||
        (command.type === "guess" &&
          (expired ||
            (snapshot.answerMode === "multiple-choice" &&
              (hasPending || snapshot.viewer.answeredCurrentRound))))
      ) {
        return;
      }
      void executeCommand({
        sessionId: snapshot.sessionId,
        request: makeSongGuessCommand(snapshot, command),
      });
    },
    [busy, executeCommand, snapshot, expired, hasPending],
  );

  async function createSession() {
    if (!setup?.rounds.length || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await createSongGuessSession(boardId, answerMode, answerTarget);
      ++sessionSequence.current;
      setSelectedSessionId(response.snapshot.sessionId);
      setSnapshot(response.snapshot);
      setNotice(null);
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

  function prepareAutoGame(prepared: SongGuessTeacherSetup) {
    revokeDraftUrls(draftsRef.current);
    setSetup(prepared);
    setDrafts(draftsFromSetup(prepared));
    setError(null);
    setSetupError(null);
    setNotice(null);
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
    setNotice(null);
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
      setError(
        messageForAudioError(cause instanceof Error ? cause.message : "decode_failed"),
      );
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
      node.start(0, draft.startSeconds, 15);
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
      const generated = [
        createSongGuessHighlight(draft.sourceBuffer, draft.startSeconds),
      ].map((clip) => {
        const bytes = clip.bytes.slice();
        const blob = new Blob([bytes], { type: clip.mimeType });
        return {
          tierMs: clip.tierMs,
          blob,
          url: URL.createObjectURL(blob),
        };
      });
      setDrafts((current) =>
        current.map((candidate) => {
          if (candidate.clientId !== roundId) return candidate;
          revokeGenerated(candidate.generatedClips);
          return { ...candidate, generatedClips: generated };
        }),
      );
      setError(null);
      setNotice(null);
    } catch (cause) {
      setError(
        messageForAudioError(
          cause instanceof Error ? cause.message : "clip_generation_failed",
        ),
      );
    }
  }

  async function savePack() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const workflowDrafts: SongGuessRoundSaveDraft[] = drafts.map((draft) => ({
        representativeAnswer: draft.representativeAnswer,
        artist: draft.artist,
        aliasesText: draft.aliasesText,
        accessibilityClue: draft.accessibilityClue,
        rightsConfirmed: draft.rightsConfirmed,
        existingClipAssetIds: draft.existingClipAssetIds,
        generatedClips:
          draft.generatedClips?.map((clip) => ({
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
      setNotice("저장됨");
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

  const exitRoom = useCallback(() => {
    if (busy || hasPending) { setError("처리 중인 요청을 확인한 뒤 나가 주세요."); return; }
    if (!snapshot || snapshot.phase === "finished" || (snapshot.viewer.joined === false && !snapshot.viewer.isRoomHost && snapshot.viewer.role !== "host") || (snapshot.viewer.role === "host" && snapshot.roomMode === "student-free")) {
      ++sessionSequence.current; setSelectedSessionId(null); setSnapshot(null); setTeacherSetup(false); return;
    }
    const finish = snapshot.viewer.isRoomHost === true || snapshot.viewer.role === "host";
    if (!window.confirm(finish ? "게임을 끝내고 나갈까요? 모든 참여자의 게임이 종료돼요." : "방에서 나갈까요?")) return;
    void executeCommand({ sessionId: snapshot.sessionId, request: makeSongGuessCommand(snapshot, { type: finish ? "finish" : "leave" }) });
  }, [busy, hasPending, snapshot, executeCommand]);
  useEffect(() => {
    if (!selectedSessionId) return;
    if (historySession.current !== selectedSessionId) { window.history.pushState({ songGuessRoom: selectedSessionId }, ""); historySession.current = selectedSessionId; }
    const back = () => { window.history.pushState({ songGuessRoom: selectedSessionId }, ""); exitRoom(); };
    const unload = (event: BeforeUnloadEvent) => { if (snapshot && snapshot.phase !== "finished" && (snapshot.viewer.joined || snapshot.viewer.isRoomHost || snapshot.viewer.role === "host")) { event.preventDefault(); event.returnValue = ""; } };
    const navigate = (event: MouseEvent) => { const link = event.target instanceof Element ? event.target.closest("a[href]") : null; if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0 && link.getAttribute("target") !== "_blank") { event.preventDefault(); event.stopPropagation(); exitRoom(); } };
    document.addEventListener("click", navigate, true);
    window.addEventListener("popstate", back); window.addEventListener("beforeunload", unload);
    return () => { window.removeEventListener("popstate", back); window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [selectedSessionId, exitRoom, snapshot?.viewer.joined, snapshot?.phase]);

  if (loading) {
    return (
      <section className={styles.shell} data-viewer={viewer} aria-label={boardTitle}>
        <div className={styles.panel} role="status">
          음악 퀴즈를 불러오는 중이에요…
        </div>
      </section>
    );
  }

  if (!selectedSessionId && !teacherSetup) return <section className={styles.shell} aria-label={boardTitle}><BoardHeading title={boardTitle} /><SongGuessRooms boardId={boardId} teacher={viewer === "teacher"} onSelect={(id) => { setSnapshot(null); setSelectedSessionId(id); }} onTeacherSetup={() => setTeacherSetup(true)} /></section>;

  if (!snapshot && viewer === "teacher" && teacherSetup) {
    return (
      <section
        className={`${styles.shell} ${teacherStyles.teacherShell}`}
        data-viewer={viewer}
        aria-label={boardTitle}
      >
        <BoardHeading title={boardTitle} />
        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setTeacherSetup(false)}>방 목록</button>

        {!customEditor ? (
          <main className={teacherStyles.autoSetupMain}>
            <SongGuessPoolPicker
              boardId={boardId}
              busy={busy}
              onPreparingChange={setBusy}
              onPrepared={prepareAutoGame}
            />
            {setup && (
              <>
                <SongGuessAnswerGuide
                  key={boardId}
                  setup={setup}
                  answerTarget={answerTarget}
                />
                <SongGuessSetupControls
                  boardId={boardId}
                  setup={setup}
                  busy={busy}
                  answerMode={answerMode}
                  answerTarget={answerTarget}
                  onAnswerModeChange={setAnswerMode}
                  onAnswerTargetChange={setAnswerTarget}
                  onCreate={() => void createSession()}
                  onRemove={() => void removeSetup()}
                />
              </>
            )}
            <button
              type="button"
              className={teacherStyles.advancedButton}
              disabled={busy}
              onClick={() => setCustomEditor(true)}
            >
              직접 음원 구성
            </button>
            <StatusMessages error={error ?? setupError} notice={notice} />
          </main>
        ) : (
          <>
            {setup && (
              <SongGuessAnswerGuide
                key={boardId}
                setup={setup}
                answerTarget={answerTarget}
              />
            )}
            <div className={styles.editorLayout}>
              <main className={styles.editorMain}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy}
                  onClick={() => setCustomEditor(false)}
                >
                  자동 출제로 돌아가기
                </button>
                <SongGuessImportPanel
                  boardId={boardId}
                  disabled={busy || drafts.length >= 50}
                  onBusyChange={setBusy}
                  onAdd={({ title, artist, clip }) => {
                    setDrafts((current) => {
                      const next = {
                        ...emptyRoundDraft(),
                        representativeAnswer: title,
                        artist,
                        existingClipAssetIds: [clip.id],
                        existingClipSummary: [clip],
                      };
                      const empty =
                        current.length === 1 &&
                        !current[0]!.representativeAnswer &&
                        !current[0]!.sourceBuffer &&
                        !current[0]!.existingClipAssetIds;
                      return empty ? [next] : [...current, next];
                    });
                  }}
                />
                <div className={styles.sectionHeading}>
                  <div>
                    <h2>라운드 음원 준비</h2>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() =>
                      setDrafts((current) => [...current, emptyRoundDraft()])
                    }
                    disabled={busy || drafts.length >= 50}
                  >
                    노래 추가
                  </button>
                </div>

                {drafts.map((draft, index) => (
                  <SongGuessRoundEditor
                    key={draft.clientId}
                    draft={draft}
                    index={index}
                    draftCount={drafts.length}
                    busy={busy}
                    decodingRoundId={decodingRoundId}
                    setDrafts={setDrafts}
                    onSourceFile={handleSourceFile}
                    onPreviewSource={previewSource}
                    onGenerateClips={generateClips}
                  />
                ))}
              </main>

              <aside className={styles.editorSidebar}>
                <SongGuessSetupControls
                  boardId={boardId}
                  setup={setup}
                  busy={busy}
                  answerMode={answerMode}
                  answerTarget={answerTarget}
                  compact
                  showSave
                  saveDisabled={drafts.length === 0}
                  onAnswerModeChange={setAnswerMode}
                  onAnswerTargetChange={setAnswerTarget}
                  onSave={() => void savePack()}
                  onCreate={() => void createSession()}
                  onRemove={() => void removeSetup()}
                />
                <StatusMessages error={error ?? setupError} notice={notice} />
              </aside>
            </div>
          </>
        )}
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className={styles.shell} data-viewer={viewer} aria-label={boardTitle}>
        <div className={styles.panel}>
          <h2>{error ? "게임을 불러오지 못했어요" : "게임 준비 중"}</h2>
          <button type="button" className={styles.secondaryButton} onClick={exitRoom}>방 목록</button>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => void refreshSession()}
            disabled={syncing}
          >
            최신 상태 확인
          </button>
          <StatusMessages error={error ?? setupError} notice={notice} />
        </div>
      </section>
    );
  }

  return (
    <section
      className={`${styles.shell} ${viewer === "teacher" ? teacherStyles.teacherShell : ""}`}
      data-viewer={viewer}
      aria-label={boardTitle}
    >
      <BoardHeading title={boardTitle} />
      <button type="button" className={styles.secondaryButton} disabled={busy || hasPending} onClick={exitRoom}>{snapshot.phase === "finished" ? "방 목록" : "방 나가기"}</button>
      {snapshot.phase === "finished" && viewer === "teacher" && snapshot.roomMode !== "student-free" && <button type="button" className={styles.primaryButton} onClick={() => { setSelectedSessionId(null); setSnapshot(null); setTeacherSetup(true); }}>다시 구성하기</button>}
      <SongGuessGame
        snapshot={snapshot}
        totalRounds={setup?.rounds.length ?? null}
        canInteract={!busy && !(hasPending && snapshot.answerMode === "multiple-choice")}
        remainingSeconds={remainingSeconds}
        expired={expired}
        entryFailed={entryFailed}
        guessText={guessText}
        onGuessText={setGuessText}
        onIntent={sendIntent}
        result={lastGuessResult}
        onReloadSetup={() => void reloadSetup()}
        status={
          <>
            <StatusMessages error={error ?? setupError} notice={notice} />
            {viewer === "teacher" && snapshot.viewer.role === "host" && setup && (
              <SongGuessAnswerGuide
                key={`${boardId}:${snapshot.sessionId}`}
                setup={setup}
                answerTarget={snapshot.answerTarget}
                currentRoundId={snapshot.currentRound.roundId}
              />
            )}
            {(error || hasPending || entryFailed) && (
              <div>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={busy || syncing}
                  onClick={() => void refreshSession()}
                >
                  최신 상태 확인
                </button>
                {entryFailed &&
                  !hasPending &&
                  snapshot.phase === "lobby" &&
                  snapshot.viewer.role === "participant" && (
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={busy || syncing}
                      onClick={() => sendIntent({ type: "join" })}
                    >
                      다시 시도
                    </button>
                  )}
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
                    다시 보내기
                  </button>
                )}
              </div>
            )}
          </>
        }
      />
    </section>
  );
}
