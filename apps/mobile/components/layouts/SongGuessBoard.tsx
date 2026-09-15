import { useAudioPlayer } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  AppState,
  Keyboard,
  ScrollView,
  Text,
  View,
} from "react-native";
import { ApiError, getApiUrl } from "../../lib/api";
import type { BoardDetailResponse } from "../../lib/types";
import {
  isSongGuessSnapshot,
  makeSongGuessCommand,
  mergeSongGuessSnapshot,
  type SongGuessSnapshot,
} from "../../lib/song-guess-contract";
import {
  clearPendingSongGuessCommand,
  fetchSongGuessSnapshot,
  loadPendingSongGuessCommand,
  messageForError,
  monotonicNow,
  phaseLabel,
  savePendingSongGuessCommand,
  songGuessRemainingSeconds,
  songGuessApiError,
  submitSongGuessCommand,
  type PendingSongGuessCommand,
} from "../../lib/song-guess";
import {
  BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS,
  useBoardRealtime,
} from "../../lib/use-board-realtime";
import { SongGuessScoreboard } from "../song-guess/SongGuessScoreboard";
import { SongGuessLobbyStatus } from "../song-guess/SongGuessLobbyStatus";
import { SongGuessAnswer } from "../song-guess/SongGuessAnswer";
import { SongGuessHeaderActions } from "../song-guess/song-guess-header-actions";
import { useSongGuessRoundAudio } from "../song-guess/use-song-guess-round-audio";
import { songGuessBoardStyles as styles } from "../song-guess/songGuessBoardStyles";
import { songGuessRoomsStyles as stateStyles } from "../song-guess/songGuessRoomsStyles";
import { AppButton } from "../ui";
import { SongGuessRooms } from "../song-guess/song-guess-rooms";
import { useNavigation } from "expo-router";
type SongGuessSound =
  | "correct"
  | "join"
  | "podium"
  | "round-results"
  | "start"
  | "wrong";
/** Result cues replace the round clip, never interrupt its start. */
const CLIP_STOPPING_SOUNDS: SongGuessSound[] = ["round-results", "podium"];
export function SongGuessBoard({ data }: { data: BoardDetailResponse }) {
  const boardId = data.board.id;
  const [snapshot, setSnapshot] = useState<SongGuessSnapshot | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [guess, setGuess] = useState("");
  const [pendingChoiceId, setPendingChoiceId] = useState<string | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const [failedJoinSessionId, setFailedJoinSessionId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const sequenceRef = useRef(0);
  const retriedRef = useRef<string | null>(null);
  const autoJoinedSessionRef = useRef<string | null>(null);
  const pendingRequestIdRef = useRef<string | null>(null);
  const { player, preparing: audioPreparing, error: audioError, playing: audioPlaying, retry: retryAudio } = useSongGuessRoundAudio(snapshot, muted);
  const soundPlayer = useAudioPlayer(null, { downloadFirst: true });
  const phaseSoundKeyRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const playSound = useCallback(
    (sound: SongGuessSound) => {
      if (muted || appStateRef.current !== "active") return;
      try {
        if (CLIP_STOPPING_SOUNDS.includes(sound)) player.pause();
        soundPlayer.replace({
          uri: getApiUrl(`/sounds/song-guess/${sound}.ogg`),
        });
        soundPlayer.play();
      } catch {}
    },
    [muted, player, soundPlayer],
  );

  useEffect(() => { soundPlayer.muted = muted; }, [muted, soundPlayer]);
  useEffect(() => { if (audioPlaying) soundPlayer.pause(); }, [audioPlaying, soundPlayer]);

  useEffect(
    () => () => {
      try {
        player.pause();
        soundPlayer.pause();
      } catch {}
    },
    [player, soundPlayer],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
      if (nextState !== "active") {
        try {
          player.pause();
          soundPlayer.pause();
        } catch {}
      }
    });
    return () => subscription.remove();
  }, [player, soundPlayer]);

  const clockRef = useRef<{
    key: string;
    serverTimeMs: number;
    monotonicMs: number;
  } | null>(null);
  const [monotonicNowMs, setMonotonicNowMs] = useState(0);
  const snapshotClockKey = snapshot
    ? `${snapshot.sessionId}:${snapshot.version}:${snapshot.currentRound.roundId}`
    : null;

  useEffect(() => {
    if (
      !snapshot ||
      snapshot.phase !== "guessing" ||
      snapshot.rulesVersion !== 2
    ) {
      setMonotonicNowMs(0);
      return;
    }
    const now = monotonicNow();
    if (clockRef.current?.key !== snapshotClockKey) {
      clockRef.current = {
        key: snapshotClockKey ?? "",
        serverTimeMs: snapshot.serverTimeMs,
        monotonicMs: now,
      };
    }
    setMonotonicNowMs(now);
    const timer = setInterval(() => setMonotonicNowMs(monotonicNow()), 100);
    return () => clearInterval(timer);
  }, [snapshot?.phase, snapshot?.rulesVersion, snapshotClockKey]);

  const refresh = useCallback(async () => {
    const sequence = ++sequenceRef.current;
    setSyncing(true);
    try {
      const next = selectedSessionId ? await fetchSongGuessSnapshot(selectedSessionId) : null;
      if (sequence !== sequenceRef.current) return;
      setSnapshot((current) => {
        if (!next) return null;
        if (!current || current.sessionId !== next.sessionId) return next;
        return mergeSongGuessSnapshot(current, next.sessionId, next);
      });
      setError(null);
      const pending = await loadPendingSongGuessCommand(boardId);
      if (sequence !== sequenceRef.current) return;
      setHasPending(!!pending && pending.sessionId === next?.sessionId);
    } catch (cause) {
      if (sequence === sequenceRef.current) setError(messageForError(cause));
    } finally {
      if (sequence === sequenceRef.current) {
        setLoading(false);
        setSyncing(false);
      }
    }
  }, [boardId, selectedSessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useBoardRealtime({
    slug: boardId,
    onReload: refresh,
    fallbackPollMs: BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS,
  });
  useEffect(() => {
    if (snapshot?.roomMode !== "student-free" || snapshot.phase === "finished" || snapshot.nextTransitionAtMs == null) return;
    const timer = setTimeout(() => void refresh(), Math.max(0, snapshot.nextTransitionAtMs - snapshot.serverTimeMs + 150));
    return () => clearTimeout(timer);
  }, [refresh, snapshot]);

  const executePending = useCallback(
    async (pending: PendingSongGuessCommand, persist = true) => {
      if (pendingRequestIdRef.current) return;
      pendingRequestIdRef.current = pending.request.requestId;
      if (persist) {
        await savePendingSongGuessCommand(boardId, pending).catch(
          () => undefined,
        );
      }
      setHasPending(true);
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const response = await submitSongGuessCommand(
          pending.sessionId,
          pending.request,
        );
        setSnapshot((current) =>
          mergeSongGuessSnapshot(current, pending.sessionId, response.snapshot),
        );
        if (response.result) {
          playSound(response.result.correct ? "correct" : "wrong");
        } else if (pending.request.command.type === "join") {
          playSound("join");
        }
        await clearPendingSongGuessCommand(boardId).catch(() => undefined);
        if (pending.request.command.type === "join") setFailedJoinSessionId(null);
        setHasPending(false);
        if (pending.request.command.type === "leave" || pending.request.command.type === "finish") {
          ++sequenceRef.current; setSelectedSessionId(null); setSnapshot(null); autoJoinedSessionRef.current = null;
        }
        setGuess("");
        Keyboard.dismiss();
      } catch (cause) {
        const body = songGuessApiError(cause);
        if (
          cause instanceof ApiError &&
          cause.status === 409 &&
          isSongGuessSnapshot(body?.snapshot)
        ) {
          setSnapshot((current) =>
            mergeSongGuessSnapshot(current, pending.sessionId, body.snapshot!),
          );
          await clearPendingSongGuessCommand(boardId).catch(() => undefined);
          setHasPending(false);
          if (pending.request.command.type === "join") setFailedJoinSessionId(body.snapshot!.viewer.joined === false ? pending.sessionId : null);
          setNotice("최신 상태로 맞췄어요.");
        } else {
          if (pending.request.command.type === "join") setFailedJoinSessionId(pending.sessionId);
          if (
            cause instanceof ApiError &&
            cause.status < 500 &&
            cause.status !== 408
          ) {
            await clearPendingSongGuessCommand(boardId).catch(() => undefined);
            setHasPending(false);
          }
          setError(messageForError(cause));
        }
      } finally {
        if (pendingRequestIdRef.current === pending.request.requestId) pendingRequestIdRef.current = null;
        setPendingChoiceId(null);
        setBusy(false);
      }
    },
    [boardId, playSound],
  );

  useEffect(() => {
    if (!snapshot || busy) return;
    let cancelled = false;
    void loadPendingSongGuessCommand(boardId).then((pending) => {
      if (
        cancelled ||
        !pending ||
        pending.sessionId !== snapshot.sessionId ||
        retriedRef.current === pending.request.requestId
      )
        return;
      retriedRef.current = pending.request.requestId;
      void executePending(pending, false);
    });
    return () => {
      cancelled = true;
    };
  }, [boardId, busy, executePending, snapshot]);

  useEffect(() => {
    if (
      !snapshot ||
      snapshot.phase !== "lobby" ||
      snapshot.viewer.role !== "participant" ||
      snapshot.viewer.joined !== false ||
      busy ||
      syncing ||
      hasPending ||
      autoJoinedSessionRef.current === snapshot.sessionId
    ) {
      return;
    }

    let cancelled = false;
    void loadPendingSongGuessCommand(boardId).then(async (pending) => {
      if (cancelled) return;
      if (pending?.sessionId === snapshot.sessionId) {
        setHasPending(true);
        return;
      }
      if (pending) {
        await clearPendingSongGuessCommand(boardId).catch(() => undefined);
      }
      if (cancelled || autoJoinedSessionRef.current === snapshot.sessionId) {
        return;
      }
      autoJoinedSessionRef.current = snapshot.sessionId;
      void executePending({
        sessionId: snapshot.sessionId,
        request: makeSongGuessCommand(snapshot, { type: "join" }),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [boardId, busy, executePending, hasPending, snapshot, syncing]);

  useEffect(() => {
    setGuess("");
    setPendingChoiceId(null);
  }, [snapshot?.currentRound.roundId]);

  const clip =
    snapshot?.phase === "guessing" ? snapshot.currentRound.currentClip : null;

  useEffect(() => {
    if (!snapshot) return;
    const key = `${snapshot.sessionId}:${snapshot.currentRound.roundId}:${snapshot.phase}`;
    if (phaseSoundKeyRef.current === key) return;
    phaseSoundKeyRef.current = key;
    if (snapshot.phase === "guessing") playSound("start");
    if (snapshot.phase === "reveal") playSound("round-results");
    if (snapshot.phase === "finished") playSound("podium");
  }, [playSound, snapshot]);

  const submitGuess = useCallback((choiceId?: string) => {
    const text = guess.trim();
    const multipleChoice = snapshot?.answerMode === "multiple-choice";
    if (
      !snapshot ||
      snapshot.phase !== "guessing" ||
      snapshot.viewer.joined === false ||
      snapshot.viewer.scoredCurrentRound ||
      (multipleChoice && (snapshot.viewer.answeredCurrentRound || snapshot.viewer.selectedChoiceId != null)) ||
      (multipleChoice ? !snapshot.currentRound.choices?.some((choice) => choice.id === choiceId) : !text) ||
      hasPending ||
      busy
    )
      return;
    if (snapshot.rulesVersion === 2) {
      const serverNowMs =
        clockRef.current?.key === snapshotClockKey
          ? clockRef.current.serverTimeMs +
            Math.max(0, monotonicNow() - clockRef.current.monotonicMs)
          : snapshot.serverTimeMs;
      if (songGuessRemainingSeconds(snapshot, serverNowMs) === 0) return;
    }
    // Highlight the tapped choice immediately; the server echo replaces it.
    if (multipleChoice && choiceId) setPendingChoiceId(choiceId);
    void executePending({
      sessionId: snapshot.sessionId,
      request: makeSongGuessCommand(snapshot, multipleChoice && choiceId ? {
        type: "guess",
        choiceId,
        roundId: snapshot.currentRound.roundId,
      } : {
        type: "guess",
        text,
        roundId: snapshot.currentRound.roundId,
      }),
    });
  }, [
    busy,
    executePending,
    guess,
    hasPending,
    snapshot,
    snapshotClockKey,
  ]);


  /** Only the room host can end the room, and the engine rejects a host
   * `leave`, so the host's exit always finishes. Guests get a plain leave. */
  const viewerFinishesRoom =
    snapshot?.viewer.canFinish === true ||
    snapshot?.viewer.isRoomHost === true ||
    snapshot?.viewer.role === "host";

  const exitRoom = useCallback(() => {
    if (busy || hasPending) { setError("처리 중인 요청을 확인한 뒤 나가 주세요."); return; }
    if (!snapshot || snapshot.phase === "finished" || (snapshot.viewer.joined === false && !viewerFinishesRoom)) {
      ++sequenceRef.current; setSelectedSessionId(null); setSnapshot(null); autoJoinedSessionRef.current = null; return;
    }
    const finish = viewerFinishesRoom;
    Alert.alert(finish ? "게임을 끝낼까요?" : "방에서 나갈까요?", finish ? "모든 참여자의 게임이 종료돼요." : undefined, [
      { text: "취소", style: "cancel" },
      { text: finish ? "게임 끝내기" : "나가기", style: "destructive", onPress: () => void executePending({ sessionId: snapshot.sessionId, request: makeSongGuessCommand(snapshot, { type: finish ? "finish" : "leave" }) }) },
    ]);
  }, [busy, hasPending, snapshot, executePending, viewerFinishesRoom]);
  useEffect(() => {
    if (!selectedSessionId) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { exitRoom(); return true; });
    const unsubscribe = navigation.addListener("beforeRemove", (event) => { event.preventDefault(); exitRoom(); });
    return () => { subscription.remove(); unsubscribe(); };
  }, [selectedSessionId, exitRoom, navigation]);

  if (!selectedSessionId) return <SongGuessRooms boardId={boardId} onSelect={(id) => { setSnapshot(null); setLoading(true); setSelectedSessionId(id); }} />;

  if (loading) {
    return (
      <View style={stateStyles.stateScreen} accessibilityLiveRegion="polite">
        <View style={stateStyles.stateCard}>
          <Text style={stateStyles.stateEyebrow}>LOADING</Text>
          <ActivityIndicator />
          <Text style={stateStyles.stateTitle}>음악 퀴즈를 불러오고 있어요</Text>
          <Text style={stateStyles.stateBody}>
            {"방 정보와 첫 문제를 준비하는 중이에요.\n잠시만 기다려 주세요."}
          </Text>
        </View>
      </View>
    );
  }

  if (!snapshot && error) {
    return (
      <View style={stateStyles.stateScreen}>
        <View style={[stateStyles.stateCard, stateStyles.stateCardDanger]} accessibilityRole="alert">
          <Text style={[stateStyles.stateEyebrow, stateStyles.stateEyebrowDanger]}>OFFLINE</Text>
          <View style={[stateStyles.stateIcon, stateStyles.stateIconDanger]}>
            <Text style={[stateStyles.stateIconText, stateStyles.stateIconTextDanger]}>!</Text>
          </View>
          <Text style={stateStyles.stateTitle}>연결이 끊겼어요</Text>
          <Text style={stateStyles.stateBody}>
            {"네트워크를 확인한 뒤 다시 시도해 주세요.\n점수는 서버에 저장되어 있어요."}
          </Text>
          <Text style={styles.errorText}>{error}</Text>
          <View style={stateStyles.stateActions}>
            <AppButton
              style={stateStyles.primaryAction}
              textStyle={stateStyles.primaryActionText}
              onPress={() => void refresh()}
            >
              다시 시도
            </AppButton>
            <AppButton
              variant="secondary"
              style={stateStyles.secondaryAction}
              textStyle={stateStyles.secondaryActionText}
              onPress={exitRoom}
            >
              방 목록
            </AppButton>
          </View>
        </View>
      </View>
    );
  }

  if (!snapshot || snapshot.phase === "draft") {
    return (
      <View style={stateStyles.stateScreen}>
        <View style={stateStyles.stateCard} accessibilityLiveRegion="polite">
          <Text style={stateStyles.stateEyebrow}>READY</Text>
          <View style={stateStyles.stateIcon}>
            <Text style={stateStyles.stateIconText}>♪</Text>
          </View>
          <Text style={stateStyles.stateTitle}>곧 시작해요</Text>
          <Text style={stateStyles.stateBody}>
            {"로비가 열리면 자동으로 입장돼요.\n화면을 켠 채로 기다려 주세요."}
          </Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={stateStyles.stateActions}>
            <AppButton
              variant="secondary"
              style={stateStyles.secondaryAction}
              textStyle={stateStyles.secondaryActionText}
              onPress={() => void refresh()}
            >
              다시 시도
            </AppButton>
          </View>
        </View>
      </View>
    );
  }

  const estimatedServerNowMs =
    snapshot && clockRef.current?.key === snapshotClockKey
      ? clockRef.current.serverTimeMs +
        Math.max(0, monotonicNowMs - clockRef.current.monotonicMs)
      : (snapshot?.serverTimeMs ?? 0);
  const remainingSeconds =
    snapshot.phase === "guessing"
      ? songGuessRemainingSeconds(snapshot, estimatedServerNowMs)
      : null;
  const deadlineReached = remainingSeconds !== null && remainingSeconds <= 0;
  const canGuess =
    snapshot.phase === "guessing" &&
    snapshot.viewer.joined !== false &&
    !snapshot.viewer.scoredCurrentRound &&
    !(snapshot.answerMode === "multiple-choice" &&
      (snapshot.viewer.answeredCurrentRound || snapshot.viewer.selectedChoiceId != null)) &&
    !deadlineReached;
  const entryFailed =
    failedJoinSessionId === snapshot.sessionId &&
    snapshot.viewer.joined === false &&
    !busy &&
    !syncing &&
    !hasPending;
  const answerPrompt = snapshot.answerTarget === "artist"
    ? "가수·작곡가"
    : snapshot.answerTarget === "artist-title"
      ? "가수·작곡가와 노래 제목"
      : "노래 제목";
  const roundDurationSeconds = snapshot.currentRound.deadlineAtMs != null && snapshot.currentRound.startedAtMs != null
    ? Math.max(1, (snapshot.currentRound.deadlineAtMs - snapshot.currentRound.startedAtMs) / 1000)
    : null;
  const roundTimerProgress = remainingSeconds === null || roundDurationSeconds === null
    ? 0
    : Math.max(0, Math.min(1, remainingSeconds / roundDurationSeconds));
  const ownParticipant = snapshot.viewer.participantIndex == null
    ? null
    : snapshot.participants[snapshot.viewer.participantIndex] ?? null;
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={styles.scroll}
    >
      <SongGuessHeaderActions
        musicActive={snapshot.phase === "lobby"}
        exitKind={snapshot.phase === "finished" ? "back" : viewerFinishesRoom ? "finish" : "leave"}
        exitLabel={snapshot.phase === "finished" ? "방 목록" : viewerFinishesRoom ? "게임 끝내기" : "방 나가기"}
        disabled={busy || hasPending}
        onExit={exitRoom}
        roundAudioActive={snapshot.phase === "guessing"}
        muted={muted}
        onToggleMute={() => setMuted((value) => !value)}
      />
      {snapshot.viewer.canStart && snapshot.phase === "lobby" ? <AppButton disabled={busy || hasPending} onPress={() => void executePending({ sessionId: snapshot.sessionId, request: makeSongGuessCommand(snapshot, { type: "start" }) })}>음악 퀴즈 시작</AppButton> : null}
      <View style={styles.phaseRow} accessibilityLiveRegion="polite">
        <Text style={styles.phaseLabel}>
          {snapshot.phase === "guessing" ? "노래 맞히기" : phaseLabel(snapshot.phase)}
        </Text>
        <Text style={styles.roundText}>
          {snapshot.phase === "guessing" && remainingSeconds !== null
            ? deadlineReached ? "시간 종료" : `${remainingSeconds}초`
            : `${snapshot.currentRound.order + 1}라운드`}
        </Text>
      </View>

      {snapshot.phase === "lobby" ? (
        <SongGuessLobbyStatus
          snapshot={snapshot}
          studentId={data.currentStudent?.id}
          joined={snapshot.viewer.joined !== false}
          pending={hasPending || busy || syncing}
          failed={entryFailed}
          onRetry={() => {
            setFailedJoinSessionId(null);
            void executePending({
              sessionId: snapshot.sessionId,
              request: makeSongGuessCommand(snapshot, { type: "join" }),
            });
          }}
        />
      ) : null}

      {snapshot.phase === "guessing" && roundDurationSeconds !== null ? (
        <View
          style={styles.roundTimerTrack}
          accessibilityRole="progressbar"
          accessibilityLabel={deadlineReached ? "응답 시간 종료" : "남은 응답 시간"}
          accessibilityValue={{ min: 0, max: Math.ceil(roundDurationSeconds), now: Math.max(0, remainingSeconds ?? 0) }}
        >
          <View style={[styles.roundTimerFill, { width: `${roundTimerProgress * 100}%` }]} />
        </View>
      ) : null}

      {snapshot.phase === "guessing" && <Text style={styles.questionText}>{`이 노래의 ${answerPrompt}은?`}</Text>}
      {snapshot.phase === "guessing" && !clip && <Text style={styles.playerError} accessibilityRole="alert">음원 파일이 없는 문제예요.</Text>}

      {snapshot.phase === "guessing" && audioError && !deadlineReached ? (
        <View accessibilityRole="alert">
          <Text style={styles.playerError}>{audioError}</Text>
          {clip?.mimeType.startsWith("audio/") && <AppButton
            variant="secondary"
            style={styles.actionButton}
            textStyle={styles.actionButtonText}
            loading={audioPreparing}
            disabled={audioPreparing}
            onPress={retryAudio}
          >다시 재생</AppButton>}
        </View>
      ) : null}

      {snapshot.currentRound.accessibilityClue ? (
        <View style={styles.clueCard}>
          <Text style={styles.clueLabel}>글자 힌트</Text>
          <Text style={styles.clueValue}>
            {snapshot.currentRound.accessibilityClue}
          </Text>
        </View>
      ) : null}

      <SongGuessAnswer
        snapshot={snapshot}
        canGuess={canGuess}
        busy={busy}
        blocked={hasPending}
        guess={guess}
        onGuessChange={setGuess}
        onSubmit={submitGuess}
        pendingChoiceId={pendingChoiceId}
      />

      {snapshot.phase === "guessing" && snapshot.viewer.joined === false ? (
        <View style={styles.waitingCard} accessibilityLiveRegion="polite">
          <Text style={styles.joinTitle} selectable>
            지금은 관전 중이에요
          </Text>
          <Text style={styles.muted} selectable>
            이미 시작한 게임이라 이번 문제는 참여할 수 없어요. 친구들의 정답과 순위는 함께 볼 수 있어요.
          </Text>
          <Text style={styles.clueLabel} selectable>
            다음 게임부터 바로 참여할 수 있어요
          </Text>
        </View>
      ) : null}

      {(snapshot.phase === "reveal" || snapshot.phase === "finished") &&
      snapshot.currentRound.revealedAnswer ? (
        <View style={styles.answerCard}>
          <Text style={styles.answerLabel}>정답</Text>
          <Text style={styles.answerText}>{snapshot.currentRound.revealedAnswer}</Text>
        </View>
      ) : null}

      <SongGuessScoreboard snapshot={snapshot} studentId={data.currentStudent?.id} />

      <View style={styles.sessionFooter}>
        <Text style={styles.sessionMeta}>
          {syncing ? "동기화 중" : error ? "연결 확인 필요" : snapshot.phase === "finished" ? "최종 결과" : "연결됨"}
        </Text>
        <Text style={styles.sessionScore}>
          {ownParticipant ? `${ownParticipant.score.toLocaleString("ko-KR")}점` : `${snapshot.participants.length}명`}
        </Text>
      </View>

      <View style={styles.actions}>
        {hasPending ? (
          <AppButton
            variant="secondary"
            style={styles.actionButton}
            textStyle={styles.actionButtonText}
            disabled={busy}
            onPress={() => {
              void loadPendingSongGuessCommand(boardId).then((pending) => {
                if (pending) void executePending(pending, false);
              });
            }}
          >
            다시 보내기
          </AppButton>
        ) : null}
      </View>

      {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}
