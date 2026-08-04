import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ApiError } from "../../lib/api";
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
  fetchCurrentSongGuessSession,
  loadPendingSongGuessCommand,
  loadSongGuessAudioSource,
  savePendingSongGuessCommand,
  songGuessApiError,
  submitSongGuessCommand,
  type PendingSongGuessCommand,
} from "../../lib/song-guess";
import {
  BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS,
  shouldUseBoardFallbackPolling,
  useBoardRealtime,
} from "../../lib/use-board-realtime";
import {
  borders,
  colors,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { AppButton, EmptyState, TextField } from "../ui";

export function SongGuessBoard({ data }: { data: BoardDetailResponse }) {
  const boardId = data.board.id;
  const [snapshot, setSnapshot] = useState<SongGuessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [guess, setGuess] = useState("");
  const [lastResult, setLastResult] = useState<SongGuessGuessResult | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const [audioPreparing, setAudioPreparing] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const sequenceRef = useRef(0);
  const retriedRef = useRef<string | null>(null);
  const player = useAudioPlayer(null, { downloadFirst: true, updateInterval: 100 });
  const playerStatus = useAudioPlayerStatus(player);

  const refresh = useCallback(async () => {
    const sequence = ++sequenceRef.current;
    setSyncing(true);
    try {
      const next = await fetchCurrentSongGuessSession(boardId);
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
  }, [boardId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const realtime = useBoardRealtime({ slug: boardId, onReload: refresh });
  useEffect(() => {
    if (!shouldUseBoardFallbackPolling(realtime.status)) return;
    const timer = setInterval(() => void refresh(), BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [realtime.status, refresh]);

  const executePending = useCallback(
    async (pending: PendingSongGuessCommand, persist = true) => {
      if (persist) {
        await savePendingSongGuessCommand(boardId, pending).catch(() => undefined);
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
        if (response.result) setLastResult(response.result);
        await clearPendingSongGuessCommand(boardId).catch(() => undefined);
        setHasPending(false);
        setGuess("");
        Keyboard.dismiss();
      } catch (cause) {
        const body = songGuessApiError(cause);
        if (cause instanceof ApiError && cause.status === 409 && isSongGuessSnapshot(body?.snapshot)) {
          setSnapshot((current) =>
            mergeSongGuessSnapshot(current, pending.sessionId, body.snapshot!),
          );
          await clearPendingSongGuessCommand(boardId).catch(() => undefined);
          setHasPending(false);
          setNotice("최신 상태로 맞췄어요.");
        } else {
          if (cause instanceof ApiError && cause.status < 500 && cause.status !== 408) {
            await clearPendingSongGuessCommand(boardId).catch(() => undefined);
            setHasPending(false);
          }
          setError(messageForError(cause));
        }
      } finally {
        setBusy(false);
      }
    },
    [boardId],
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
      ) return;
      retriedRef.current = pending.request.requestId;
      void executePending(pending, false);
    });
    return () => {
      cancelled = true;
    };
  }, [boardId, busy, executePending, snapshot]);

  useEffect(() => {
    setGuess("");
    setLastResult(null);
  }, [snapshot?.currentRound.roundId]);

  const clip = snapshot?.phase === "guessing" ? snapshot.currentRound.currentClip : null;
  useEffect(() => {
    let active = true;
    try {
      player.pause();
    } catch {
      // ignore pause failures while the player is empty
    }
    setAudioError(null);
    if (!snapshot || !clip) {
      setAudioPreparing(false);
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
      } catch {
        // ignore
      }
    };
  }, [clip?.assetId, player, snapshot?.sessionId]);

  const submitGuess = useCallback(() => {
    const text = guess.trim();
    if (!snapshot || snapshot.phase !== "guessing" || !text || busy || syncing) return;
    void executePending({
      sessionId: snapshot.sessionId,
      request: makeSongGuessCommand(snapshot, { type: "guess", text }),
    });
  }, [busy, executePending, guess, snapshot, syncing]);

  const playClip = useCallback(async () => {
    if (!clip || audioPreparing || !playerStatus.isLoaded) return;
    try {
      if (playerStatus.currentTime >= Math.max(0, playerStatus.duration - 0.05)) {
        await player.seekTo(0);
      }
      player.play();
      setAudioError(null);
    } catch {
      setAudioError("재생을 시작하지 못했어요.");
    }
  }, [audioPreparing, clip, player, playerStatus.currentTime, playerStatus.duration, playerStatus.isLoaded]);

  if (loading) {
    return (
      <View style={styles.center} accessibilityLiveRegion="polite">
        <ActivityIndicator />
      </View>
    );
  }

  if (!snapshot || snapshot.phase === "draft") {
    return (
      <View style={styles.emptyContainer}>
        <EmptyState title="준비 중" description="로비가 열리면 시작돼요." />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <AppButton variant="secondary" onPress={() => void refresh()}>
          다시 확인
        </AppButton>
      </View>
    );
  }

  const ranked = [...snapshot.participants].sort(
    (left, right) => right.score - left.score || left.displayName.localeCompare(right.displayName),
  );
  const canGuess = snapshot.phase === "guessing" && !snapshot.viewer.scoredCurrentRound;
  const progress = playerStatus.duration > 0
    ? Math.min(1, playerStatus.currentTime / playerStatus.duration)
    : 0;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={styles.scroll}
    >
      <View style={styles.phaseRow} accessibilityLiveRegion="polite">
        <Text style={styles.phaseLabel}>{phaseLabel(snapshot.phase)}</Text>
        <Text style={styles.roundText}>{snapshot.currentRound.order + 1}라운드</Text>
      </View>

      {snapshot.phase === "guessing" && clip ? (
        <View style={styles.playerCard}>
          <View style={styles.playerTopRow}>
            <Text style={styles.playerDuration}>{formatTier(clip.tierMs)}</Text>
            <Text style={styles.playerTime}>
              {formatSeconds(playerStatus.currentTime)} / {formatSeconds(clip.durationMs / 1000)}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.playerActions}>
            <AppButton
              style={styles.playerButton}
              loading={audioPreparing}
              disabled={!playerStatus.isLoaded || !!audioError}
              onPress={() => void playClip()}
            >
              {playerStatus.playing ? "다시 듣기" : "듣기"}
            </AppButton>
            {playerStatus.playing ? (
              <AppButton style={styles.playerButton} variant="secondary" onPress={() => player.pause()}>
                일시정지
              </AppButton>
            ) : null}
          </View>
          {audioError ? <Text style={styles.playerError}>{audioError}</Text> : null}
        </View>
      ) : null}

      {snapshot.currentRound.accessibilityClue ? (
        <Text style={styles.clueText}>{snapshot.currentRound.accessibilityClue}</Text>
      ) : null}

      {snapshot.phase === "guessing" ? (
        <View style={styles.guessCard}>
          <TextField
            value={guess}
            onChangeText={setGuess}
            placeholder="정답"
            returnKeyType="send"
            editable={canGuess && !busy}
            maxLength={200}
            autoCorrect={false}
            onSubmitEditing={submitGuess}
            accessibilityLabel="노래 정답"
          />
          <AppButton
            loading={busy}
            disabled={!canGuess || !guess.trim() || syncing}
            onPress={submitGuess}
          >
            {snapshot.viewer.scoredCurrentRound ? "완료" : "제출"}
          </AppButton>
        </View>
      ) : null}

      {lastResult ? (
        <Text style={[styles.resultText, lastResult.correct ? styles.successText : styles.missText]}>
          {lastResult.correct
            ? lastResult.alreadyScored
              ? "이미 점수를 받았어요"
              : `정답 +${lastResult.score}`
            : "오답"}
        </Text>
      ) : null}

      {(snapshot.phase === "reveal" || snapshot.phase === "finished") && snapshot.currentRound.revealedAnswer ? (
        <Text style={styles.answerText}>{snapshot.currentRound.revealedAnswer}</Text>
      ) : null}

      <View style={styles.scoreCard}>
        {ranked.length ? ranked.map((participant, index) => (
          <View style={styles.scoreRow} key={`${participant.displayName}-${index}`}>
            <Text style={styles.rank}>{index + 1}</Text>
            <Text style={styles.playerName} numberOfLines={1}>{participant.displayName}</Text>
            <Text style={styles.score}>{participant.score}</Text>
          </View>
        )) : <Text style={styles.muted}>점수 없음</Text>}
      </View>

      <View style={styles.actions}>
        {hasPending ? (
          <AppButton
            variant="secondary"
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
        <AppButton variant="secondary" disabled={busy || syncing} onPress={() => void refresh()}>
          새로고침
        </AppButton>
      </View>

      {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
      {error ? <Text style={styles.errorText} accessibilityRole="alert">{error}</Text> : null}
    </ScrollView>
  );
}

function phaseLabel(phase: SongGuessSnapshot["phase"]): string {
  if (phase === "lobby") return "대기";
  if (phase === "guessing") return "진행";
  if (phase === "reveal") return "정답";
  if (phase === "finished") return "종료";
  return "준비";
}

function formatTier(tierMs: number): string {
  return `${(tierMs / 1000).toFixed(1)}초`;
}

function formatSeconds(seconds: number): string {
  return `${Math.max(0, seconds).toFixed(1)}초`;
}

function messageForError(error: unknown): string {
  const body = songGuessApiError(error);
  switch (body?.error) {
    case "invalid_phase":
      return "지금은 제출할 수 없어요.";
    case "domain_rejected":
      return "정답을 처리하지 못했어요.";
    case "forbidden":
      return "참여 권한이 없어요.";
    case "unauthorized":
      return "다시 로그인해 주세요.";
    case "play_engine_unavailable":
      return "게임 서버 연결이 불안정해요.";
    default:
      return "연결을 확인해 주세요.";
  }
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  container: {
    flexGrow: 1,
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.bg,
  },
  phaseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  phaseLabel: { ...typography.subtitle, color: colors.text },
  roundText: { ...typography.label, color: colors.textMuted },
  playerCard: {
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: borders.hairline,
    borderBottomWidth: borders.hairline,
    borderColor: colors.border,
  },
  playerTopRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  playerDuration: { ...typography.display, color: colors.text },
  playerTime: { ...typography.badge, color: colors.textMuted },
  progressTrack: {
    height: spacing.sm,
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
  },
  progressFill: {
    height: spacing.sm,
    backgroundColor: colors.accent,
  },
  playerActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  playerButton: { flexGrow: 1, minWidth: tapMin * 2 },
  playerError: { ...typography.badge, color: colors.danger },
  clueText: { ...typography.body, color: colors.textMuted },
  guessCard: { gap: spacing.md },
  resultText: { ...typography.subtitle },
  successText: { color: colors.plantActive },
  missText: { color: colors.danger },
  answerText: { ...typography.display, color: colors.text },
  scoreCard: {
    gap: spacing.sm,
    borderTopWidth: borders.hairline,
    borderColor: colors.border,
    paddingTop: spacing.md,
  },
  scoreRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rank: { ...typography.subtitle, width: spacing.xxl, color: colors.textMuted },
  playerName: { ...typography.body, flex: 1, color: colors.text },
  score: { ...typography.subtitle, color: colors.text },
  actions: { gap: spacing.sm },
  muted: { ...typography.body, color: colors.textMuted },
  noticeText: { ...typography.body, color: colors.plantActive },
  errorText: { ...typography.body, color: colors.danger },
});
