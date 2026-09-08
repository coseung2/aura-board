
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
  fetchCurrentSongGuessSession,
  fetchSongGuessTeacherSetup,
  makeSongGuessCommand,
  saveSongGuessTeacherSetup,
  SongGuessClientError,
  submitSongGuessCommand,
  uploadSongGuessClip,
} from "@/lib/song-guess/browser-client";
import {
  isSongGuessSnapshot,
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
import type { RoundDraft } from "./song-guess-board-model";
import { useSongGuessClock } from "./use-song-guess-clock";
import { SongGuessPoolPicker } from "./SongGuessPoolPicker";
import { SongGuessGame } from "./SongGuessGame";
import { SongGuessAnswerGuide } from "./SongGuessAnswerGuide";
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
  const sessionSequence = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const draftsRef = useRef<RoundDraft[]>([]);
  const autoRetriedRequest = useRef<string | null>(null);
  const commandInFlight = useRef(false);
  const storageKey = `aura-song-guess-pending:${boardId}`;
  const { remainingSeconds, expired } = useSongGuessClock(snapshot);
  const entryFailed = failedJoinSessionId === snapshot?.sessionId && snapshot?.viewer.joined === false && !busy;

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
      } catch (cause) {
        if (pending.request.command.type === "join") setFailedJoinSessionId(pending.sessionId);
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
      if (!snapshot || busy || (command.type === "guess" && expired)) return;
      void executeCommand({
        sessionId: snapshot.sessionId,
        request: makeSongGuessCommand(snapshot, command),
      });
    },
    [busy, executeCommand, snapshot, expired],
  );

  async function createSession() {
    if (!setup?.rounds.length || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await createSongGuessSession(boardId);
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
      const generated = [createSongGuessHighlight(draft.sourceBuffer, draft.startSeconds)].map(
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
      setNotice(null);
    } catch (cause) {
      setError(messageForAudioError(cause instanceof Error ? cause.message : "clip_generation_failed"));
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
        <BoardHeading title={boardTitle} />
        {setup && <SongGuessAnswerGuide key={boardId} setup={setup} />}
        <div className={styles.editorLayout}>
          <main className={styles.editorMain}>
            <SongGuessPoolPicker boardId={boardId} busy={busy} onPreparingChange={setBusy} onPrepared={(prepared) => {
              revokeDraftUrls(draftsRef.current);
              setSetup(prepared);
              setDrafts(draftsFromSetup(prepared));
              setError(null);
              setSetupError(null);
              setNotice(`${prepared.rounds.length}문제 준비됨`);
            }} />
            <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setCustomEditor((value) => !value)}>
              {customEditor ? "직접 구성 닫기" : "직접 음원 구성"}
            </button>
            {customEditor && <>
            <div className={styles.sectionHeading}>
              <div>
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
              <SongGuessRoundEditor key={draft.clientId} draft={draft} index={index} draftCount={drafts.length} busy={busy} decodingRoundId={decodingRoundId} setDrafts={setDrafts} onSourceFile={handleSourceFile} onPreviewSource={previewSource} onGenerateClips={generateClips} />
            ))}
            </>}
          </main>

          <aside className={styles.editorSidebar}>
            <div className={styles.sidebarCard}>
              <h2>저장 및 시작</h2>
              {setup && <p>{setup.rounds.length}문제</p>}
              {customEditor && <button
                type="button"
                className={styles.primaryButton}
                disabled={busy || drafts.length === 0}
                onClick={() => void savePack()}
              >
                {busy ? "저장 중…" : "라운드 팩 저장"}
              </button>}
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy || !setup?.rounds.length}
                onClick={() => void createSession()}
              >
                게임 만들기
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
        <BoardHeading title={boardTitle} />
        <div className={styles.panel}>
          <h2>{error ? "게임을 불러오지 못했어요" : "게임 준비 중"}</h2>
          <button className={styles.secondaryButton} type="button" onClick={() => void refreshSession()} disabled={syncing}>
            최신 상태 확인
          </button>
          <StatusMessages error={error ?? setupError} notice={notice} />
        </div>
      </section>
    );
  }

  return (
    <section className={styles.shell} aria-label={boardTitle}>
      <BoardHeading title={boardTitle} />
      {viewer === "teacher" && snapshot.viewer.role === "host" && setup &&
        <SongGuessAnswerGuide key={`${boardId}:${snapshot.sessionId}`} setup={setup} currentRoundId={snapshot.currentRound.roundId} />}
      <SongGuessGame snapshot={snapshot} totalRounds={setup?.rounds.length ?? null}
        canInteract={!busy} remainingSeconds={remainingSeconds} expired={expired}
        entryFailed={entryFailed}
        guessText={guessText} onGuessText={setGuessText} onIntent={sendIntent}
        result={lastGuessResult} onReloadSetup={() => void reloadSetup()}
        status={<>
          <StatusMessages error={error ?? setupError} notice={notice} />
          {(error || hasPending || entryFailed) && <div>
            <button className={styles.secondaryButton} type="button" disabled={busy || syncing} onClick={() => void refreshSession()}>최신 상태 확인</button>
            {entryFailed && !hasPending && snapshot.phase === "lobby" && snapshot.viewer.role === "participant" &&
              <button className={styles.secondaryButton} type="button" disabled={busy || syncing} onClick={() => sendIntent({ type: "join" })}>다시 시도</button>}
            {hasPending && <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => {
              const pending = readPending();
              if (pending) void executeCommand(pending, false);
            }}>다시 보내기</button>}
          </div>}
        </>} />
    </section>
  );
}
