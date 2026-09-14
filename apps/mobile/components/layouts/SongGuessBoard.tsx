import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
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
  type SongGuessGuessResult,
  type SongGuessSnapshot,
} from "../../lib/song-guess-contract";
import {
  clearPendingSongGuessCommand,
  fetchSongGuessSnapshot,
  loadPendingSongGuessCommand,
  loadSongGuessAudioSource,
  formatClipLabel,
  formatSeconds,
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
  shouldUseBoardFallbackPolling,
  useBoardRealtime,
} from "../../lib/use-board-realtime";
import { SongGuessScoreboard } from "../song-guess/SongGuessScoreboard";
import { SongGuessLobbyStatus } from "../song-guess/SongGuessLobbyStatus";
import { SongGuessAnswer } from "../song-guess/SongGuessAnswer";
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
  const [lastResult, setLastResult] = useState<SongGuessGuessResult | null>(
    null,
  );
  const [hasPending, setHasPending] = useState(false);
  const [failedJoinSessionId, setFailedJoinSessionId] = useState<string | null>(null);
  const [audioPreparing, setAudioPreparing] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const sequenceRef = useRef(0);
  const retriedRef = useRef<string | null>(null);
  const autoJoinedSessionRef = useRef<string | null>(null);
  const pendingRequestIdRef = useRef<string | null>(null);
  const player = useAudioPlayer(null, {
    downloadFirst: true,
    updateInterval: 100,
  });
  const playerStatus = useAudioPlayerStatus(player);
  const soundPlayer = useAudioPlayer(null, { downloadFirst: true });
  const phaseSoundKeyRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const playSound = useCallback(
    (sound: SongGuessSound) => {
      if (muted || appStateRef.current !== "active") return;
      try {
        player.pause();
        soundPlayer.replace({
          uri: getApiUrl(`/sounds/song-guess/${sound}.ogg`),
        });
        soundPlayer.play();
      } catch {}
    },
    [muted, player, soundPlayer],
  );

  useEffect(() => {
    player.muted = muted;
    soundPlayer.muted = muted;
  }, [muted, player, soundPlayer]);

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

  const realtime = useBoardRealtime({ slug: boardId, onReload: refresh });
  useEffect(() => {
    if (snapshot?.roomMode !== "student-free" || snapshot.phase === "finished") return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [refresh, snapshot?.roomMode, snapshot?.phase]);
  useEffect(() => {
    if (!shouldUseBoardFallbackPolling(realtime.status)) return;
    const timer = setInterval(
      () => void refresh(),
      BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [realtime.status, refresh]);

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
          setLastResult(response.result);
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
    setLastResult(null);
  }, [snapshot?.currentRound.roundId]);

  const clip =
    snapshot?.phase === "guessing" ? snapshot.currentRound.currentClip : null;
  useEffect(() => {
    let active = true;
    try {
      player.pause();
    } catch {}
    setAudioError(null);
    if (!snapshot || !clip) {
      setAudioPreparing(false);
      return () => {
        active = false;
      };
    }
    if (clip.mimeType === "video/youtube") {
      setAudioPreparing(false);
      setAudioError("음원 파일이 없는 문제예요.");
      return () => {
        active = false;
      };
    }
    setAudioPreparing(true);
    void loadSongGuessAudioSource(snapshot.sessionId, clip.assetId)
      .then((source) => {
        if (!active || !source) return;
        player.replace(source);
      })
      .catch(() => {
        if (active) setAudioError("음원을 불러오지 못했어요.");
      })
      .finally(() => {
        if (active) setAudioPreparing(false);
      });
    return () => {
      active = false;
      try {
        player.pause();
      } catch {}
    };
  }, [clip?.assetId, clip?.mimeType, player, snapshot?.sessionId]);

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
      busy ||
      syncing
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
    syncing,
  ]);

  const playClip = useCallback(async () => {
    if (
      !clip ||
      clip.mimeType === "video/youtube" ||
      audioPreparing ||
      !playerStatus.isLoaded
    )
      return;
    try {
      if (
        playerStatus.currentTime >= Math.max(0, playerStatus.duration - 0.05)
      ) {
        await player.seekTo(0);
      }
      player.play();
      setAudioError(null);
    } catch {
      setAudioError("재생을 시작하지 못했어요.");
    }
  }, [
    audioPreparing,
    clip,
    player,
    playerStatus.currentTime,
    playerStatus.duration,
    playerStatus.isLoaded,
  ]);

  const exitRoom = useCallback(() => {
    if (busy || hasPending) { setError("처리 중인 요청을 확인한 뒤 나가 주세요."); return; }
    if (!snapshot || snapshot.phase === "finished" || (snapshot.viewer.joined === false && !snapshot.viewer.isRoomHost && snapshot.viewer.role !== "host") || (snapshot.viewer.role === "host" && snapshot.roomMode === "student-free")) {
      ++sequenceRef.current; setSelectedSessionId(null); setSnapshot(null); autoJoinedSessionRef.current = null; return;
    }
    const finish = snapshot.viewer.isRoomHost === true || snapshot.viewer.role === "host";
    Alert.alert(finish ? "게임을 끝내고 나갈까요?" : "방에서 나갈까요?", finish ? "모든 참여자의 게임이 종료돼요." : undefined, [
      { text: "취소", style: "cancel" },
      { text: finish ? "게임 끝내기" : "나가기", style: "destructive", onPress: () => void executePending({ sessionId: snapshot.sessionId, request: makeSongGuessCommand(snapshot, { type: finish ? "finish" : "leave" }) }) },
    ]);
  }, [busy, hasPending, snapshot, executePending]);
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
  const progress =
    playerStatus.duration > 0
      ? Math.min(1, playerStatus.currentTime / playerStatus.duration)
      : 0;
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
    : 30;
  const roundTimerProgress = remainingSeconds === null
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
      <AppButton variant="secondary" disabled={busy || hasPending} onPress={exitRoom}>{snapshot.phase === "finished" ? "방 목록" : "방 나가기"}</AppButton>
      {snapshot.viewer.canStart && snapshot.phase === "lobby" ? <AppButton disabled={busy || hasPending} onPress={() => void executePending({ sessionId: snapshot.sessionId, request: makeSongGuessCommand(snapshot, { type: "start" }) })}>음악 퀴즈 시작</AppButton> : null}
      {snapshot.viewer.canFinish && snapshot.phase !== "finished" ? <AppButton variant="secondary" disabled={busy || hasPending} onPress={() => Alert.alert("게임을 끝낼까요?", "모든 참여자의 게임이 종료돼요.", [{ text: "취소", style: "cancel" }, { text: "게임 끝내기", style: "destructive", onPress: () => void executePending({ sessionId: snapshot.sessionId, request: makeSongGuessCommand(snapshot, { type: "finish" }) }) }])}>게임 끝내기</AppButton> : null}
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

      {hasPending || syncing ? (
        <View style={styles.syncBanner} accessibilityLiveRegion="polite">
          <ActivityIndicator />
          <Text style={styles.syncBannerText}>
            {hasPending ? "답을 서버로 보내는 중이에요" : "최신 상태를 확인하는 중이에요"}
          </Text>
        </View>
      ) : null}

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

      {snapshot.phase === "guessing" ? (
        <View
          style={styles.roundTimerTrack}
          accessibilityRole="progressbar"
          accessibilityLabel={deadlineReached ? "응답 시간 종료" : "남은 응답 시간"}
          accessibilityValue={{ min: 0, max: Math.ceil(roundDurationSeconds), now: Math.max(0, remainingSeconds ?? 0) }}
        >
          <View style={[styles.roundTimerFill, { width: `${roundTimerProgress * 100}%` }]} />
        </View>
      ) : null}

      {snapshot.phase === "guessing" && clip?.mimeType === "video/youtube" ? (
        <View style={styles.playerCard} accessibilityLiveRegion="polite">
          <Text style={styles.questionText}>{`이 노래의 ${answerPrompt}은?`}</Text>
          <Text style={styles.playerError} accessibilityRole="alert">
            음원 파일이 없는 문제예요.
          </Text>
        </View>
      ) : null}

      {snapshot.phase === "guessing" && clip && clip.mimeType !== "video/youtube" ? (
        <View style={styles.playerCard}>
          <View style={styles.playerMainRow}>
            <View style={styles.recordDisc}>
              <AppButton
                style={styles.recordButton}
                textStyle={styles.recordButtonText}
                loading={audioPreparing}
                disabled={!playerStatus.isLoaded || !!audioError}
                onPress={() => void playClip()}
                accessibilityLabel={playerStatus.playing ? "노래 다시 듣기" : "노래 듣기"}
              >
                {playerStatus.playing ? "↻" : "▶"}
              </AppButton>
            </View>
            <View style={styles.playerInfo}>
              <Text style={styles.playerDuration}>{formatClipLabel(clip.tierMs)}</Text>
              <Text style={styles.questionText}>{`이 노래의 ${answerPrompt}은?`}</Text>
              <Text style={styles.playerTime}>
                {formatSeconds(playerStatus.currentTime)} / {formatSeconds(clip.durationMs / 1000)}
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
            </View>
          </View>
          <View style={styles.playerActions}>
            {playerStatus.playing ? (
              <AppButton
                style={styles.secondaryPlayerButton}
                textStyle={styles.secondaryPlayerButtonText}
                variant="secondary"
                onPress={() => player.pause()}
              >
                일시정지
              </AppButton>
            ) : null}
            <AppButton
              style={styles.secondaryPlayerButton}
              textStyle={styles.secondaryPlayerButtonText}
              variant="secondary"
              onPress={() => setMuted((value) => !value)}
            >
              {muted ? "소리 켜기" : "음소거"}
            </AppButton>
          </View>
        </View>
      ) : null}

      {snapshot.phase === "guessing" && audioError ? (
        <View style={styles.audioErrorCard} accessibilityRole="alert">
          <Text style={styles.audioErrorTitle}>노래를 재생할 수 없어요</Text>
          <Text style={styles.audioErrorBody}>
            {snapshot.currentRound.accessibilityClue
              ? "볼륨과 무음 모드를 확인해 주세요. 소리 없이도 힌트로 답을 고를 수 있어요."
              : "볼륨과 무음 모드를 확인한 뒤 다시 재생해 주세요."}
          </Text>
          <Text style={styles.playerError}>{audioError}</Text>
          <AppButton
            variant="secondary"
            style={styles.actionButton}
            textStyle={styles.actionButtonText}
            onPress={() => void playClip()}
          >
            다시 재생
          </AppButton>
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
        blocked={syncing || hasPending}
        guess={guess}
        onGuessChange={setGuess}
        onSubmit={submitGuess}
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

      {lastResult ? (
        <View
          style={[
            styles.resultCard,
            lastResult.timedOut
              ? styles.resultCardTimeout
              : lastResult.correct
                ? styles.resultCardCorrect
                : styles.resultCardMiss,
          ]}
          accessibilityLiveRegion="polite"
        >
          <Text
            style={[
              styles.resultTitle,
              lastResult.timedOut
                ? null
                : lastResult.correct
                  ? styles.resultTitleCorrect
                  : styles.resultTitleMiss,
            ]}
          >
            {lastResult.timedOut
              ? "시간이 끝났어요"
              : lastResult.correct
                ? lastResult.alreadyScored
                  ? "이미 점수를 받았어요"
                  : "정답이에요!"
                : "아쉬워요"}
          </Text>
          {!lastResult.timedOut && lastResult.correct && !lastResult.alreadyScored ? (
            <Text style={styles.resultScore}>{`+${lastResult.score}점`}</Text>
          ) : null}
          <Text style={styles.resultBody}>
            {lastResult.timedOut
              ? "이번 문제는 답을 고르지 못했어요. 다음 문제에서 다시 도전할 수 있어요."
              : lastResult.correct
                ? "정답 공개에서 순위 변화를 확인해요."
                : "정답 공개를 기다려 주세요. 다음 문제에서 만회할 수 있어요."}
          </Text>
        </View>
      ) : null}

      {(snapshot.phase === "reveal" || snapshot.phase === "finished") &&
      snapshot.currentRound.revealedAnswer ? (
        <View style={styles.answerCard}>
          <Text style={styles.answerLabel}>{snapshot.viewer.scoredCurrentRound ? "정답이에요!" : "정답"}</Text>
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
        <AppButton
          variant="secondary"
          style={styles.actionButton}
          textStyle={styles.actionButtonText}
          disabled={busy || syncing}
          onPress={() => void refresh()}
        >
          새로고침
        </AppButton>
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
