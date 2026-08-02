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
  radii,
  songGuessTokens,
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
          setNotice("다른 화면에서 상태가 먼저 바뀌어 최신 게임으로 맞췄어요.");
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
    player.pause();
    player.replace(null);
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
        if (!active) return;
        player.replace(source);
      })
      .catch(() => {
        if (active) setAudioError("음원 인증 또는 다운로드에 실패했어요. 다시 시도해 주세요.");
      })
      .finally(() => {
        if (active) setAudioPreparing(false);
      });
    return () => {
      active = false;
      player.pause();
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
      setAudioError("재생을 시작하지 못했어요. 잠시 후 다시 눌러 주세요.");
    }
  }, [audioPreparing, clip, player, playerStatus.currentTime, playerStatus.duration, playerStatus.isLoaded]);

  if (loading) {
    return (
      <View style={styles.center} accessibilityLiveRegion="polite">
        <ActivityIndicator />
        <Text style={styles.muted}>음악 퀴즈 상태를 불러오는 중이에요…</Text>
      </View>
    );
  }

  if (!snapshot || snapshot.phase === "draft") {
    return (
      <ScrollView contentContainerStyle={styles.emptyContainer}>
        <EmptyState
          icon={<Text style={styles.emptyIcon}>🎧</Text>}
          title="음악 퀴즈 준비 중"
          description="교사가 로비를 열면 이 화면에 자동으로 퀴즈가 나타나요."
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <AppButton variant="secondary" onPress={() => void refresh()}>
          최신 상태 확인
        </AppButton>
      </ScrollView>
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
    >
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>SONG GUESS</Text>
          <Text style={styles.title}>{data.board.title || "초단위 음악 퀴즈"}</Text>
        </View>
        <View style={styles.roundBadge} accessibilityLabel={`${snapshot.currentRound.order + 1}라운드`}>
          <Text style={styles.roundNumber}>{snapshot.currentRound.order + 1}</Text>
          <Text style={styles.roundLabel}>ROUND</Text>
        </View>
      </View>

      <View style={styles.phaseCard} accessibilityLiveRegion="polite">
        <Text style={styles.phaseLabel}>{phaseLabel(snapshot.phase)}</Text>
        <Text style={styles.phaseHint}>{phaseHint(snapshot)}</Text>
        <Text style={styles.syncText}>v{snapshot.version} · {syncing ? "동기화 중" : "동기화됨"}</Text>
      </View>

      {snapshot.phase === "guessing" && clip ? (
        <View style={styles.playerCard}>
          <View style={styles.playerTopRow}>
            <View>
              <Text style={styles.playerLabel}>현재 공개된 구간</Text>
              <Text style={styles.playerDuration}>{formatTier(clip.tierMs)}</Text>
            </View>
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
              {playerStatus.playing ? "다시 듣기" : "클립 듣기"}
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
        <View style={styles.clueCard}>
          <Text style={styles.clueLabel}>접근성 힌트</Text>
          <Text style={styles.clueText}>{snapshot.currentRound.accessibilityClue}</Text>
        </View>
      ) : null}

      {snapshot.phase === "guessing" ? (
        <View style={styles.guessCard}>
          <Text style={styles.sectionTitle}>정답 입력</Text>
          <Text style={styles.sectionDescription}>
            공개된 길이에 따라 서버가 1000점, 700점, 400점을 판정해요.
          </Text>
          <TextField
            value={guess}
            onChangeText={setGuess}
            placeholder="곡 제목을 입력하세요"
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
            {snapshot.viewer.scoredCurrentRound ? "이번 라운드 점수 획득 완료" : "정답 제출"}
          </AppButton>
        </View>
      ) : null}

      {lastResult ? (
        <View
          style={[styles.resultCard, lastResult.correct ? styles.resultSuccess : styles.resultMiss]}
          accessibilityLiveRegion="assertive"
        >
          <Text style={[styles.resultTitle, lastResult.correct ? styles.successText : styles.missText]}>
            {lastResult.correct ? (lastResult.alreadyScored ? "이미 점수를 받았어요" : "정답이에요!") : "아쉽지만 오답이에요"}
          </Text>
          <Text style={[styles.resultBody, lastResult.correct ? styles.successText : styles.missText]}>
            {lastResult.correct ? `+${lastResult.score}점` : "다시 듣고 도전해 보세요."}
          </Text>
        </View>
      ) : null}

      {(snapshot.phase === "reveal" || snapshot.phase === "finished") && snapshot.currentRound.revealedAnswer ? (
        <View style={styles.answerCard} accessibilityLiveRegion="polite">
          <Text style={styles.answerLabel}>정답</Text>
          <Text style={styles.answerText}>{snapshot.currentRound.revealedAnswer}</Text>
        </View>
      ) : null}

      <View style={styles.scoreCard}>
        <Text style={styles.sectionTitle}>누적 점수</Text>
        {ranked.length ? ranked.map((participant, index) => (
          <View style={styles.scoreRow} key={`${participant.displayName}-${index}`}>
            <Text style={styles.rank}>{index + 1}</Text>
            <Text style={styles.playerName} numberOfLines={1}>{participant.displayName}</Text>
            <Text style={styles.score}>{participant.score}점</Text>
          </View>
        )) : <Text style={styles.muted}>참가자 점수를 기다리고 있어요.</Text>}
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
            미확인 정답 다시 보내기
          </AppButton>
        ) : null}
        <AppButton variant="secondary" disabled={busy || syncing} onPress={() => void refresh()}>
          최신 상태 확인
        </AppButton>
      </View>

      {notice ? <Text style={styles.noticeText} accessibilityLiveRegion="polite">{notice}</Text> : null}
      {error ? <Text style={styles.errorText} accessibilityRole="alert">{error}</Text> : null}
    </ScrollView>
  );
}

function phaseLabel(phase: SongGuessSnapshot["phase"]): string {
  if (phase === "lobby") return "참가 대기 중";
  if (phase === "guessing") return "노래를 듣고 맞혀 보세요";
  if (phase === "reveal") return "정답 공개";
  if (phase === "finished") return "게임 종료";
  return "세션 준비 중";
}

function phaseHint(snapshot: SongGuessSnapshot): string {
  if (snapshot.phase === "lobby") return "교사가 첫 클립을 열면 자동으로 시작해요.";
  if (snapshot.phase === "guessing") {
    return snapshot.viewer.scoredCurrentRound
      ? "이번 라운드 점수를 획득했어요. 정답 공개를 기다려 주세요."
      : "짧게 맞힐수록 더 높은 점수를 받아요.";
  }
  if (snapshot.phase === "reveal") return "다음 라운드가 열리면 화면이 자동으로 바뀌어요.";
  if (snapshot.phase === "finished") return "최종 순위를 확인해 보세요.";
  return "교사가 게임을 준비하고 있어요.";
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
      return "지금은 정답을 제출할 수 없어요. 최신 상태를 확인해 주세요.";
    case "domain_rejected":
      return "정답을 처리하지 못했어요. 입력 내용을 확인해 주세요.";
    case "forbidden":
      return "이 음악 퀴즈에 참여할 권한이 없어요.";
    case "unauthorized":
      return "로그인이 만료됐어요. 다시 로그인해 주세요.";
    case "play_engine_unavailable":
      return "게임 서버 연결이 불안정해요. 같은 정답을 안전하게 다시 보낼 수 있어요.";
    default:
      return "연결을 확인해 주세요. 미확인 정답은 같은 요청으로 다시 보낼 수 있어요.";
  }
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
    backgroundColor: songGuessTokens.pageBg,
  },
  center: {
    flex: 1,
    minHeight: songGuessTokens.loadingMinHeight,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: songGuessTokens.pageBg,
  },
  emptyContainer: {
    flexGrow: 1,
    minHeight: songGuessTokens.emptyMinHeight,
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: songGuessTokens.pageBg,
  },
  emptyIcon: { fontSize: songGuessTokens.emptyIconSize },
  hero: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  heroCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.micro, color: songGuessTokens.eyebrow, letterSpacing: songGuessTokens.eyebrowLetterSpacing },
  title: { ...typography.title, color: songGuessTokens.text },
  roundBadge: {
    width: songGuessTokens.roundBadgeSize,
    height: songGuessTokens.roundBadgeSize,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: songGuessTokens.accentSurface,
  },
  roundNumber: { ...typography.title, color: songGuessTokens.accentText },
  roundLabel: { ...typography.micro, color: songGuessTokens.accentText },
  phaseCard: {
    padding: spacing.lg,
    gap: spacing.xs,
    borderWidth: borders.hairline,
    borderColor: songGuessTokens.panelBorder,
    borderRadius: radii.card,
    backgroundColor: songGuessTokens.panelSurface,
  },
  phaseLabel: { ...typography.subtitle, color: songGuessTokens.text },
  phaseHint: { ...typography.body, color: songGuessTokens.mutedText },
  syncText: { ...typography.micro, color: songGuessTokens.eyebrow },
  playerCard: { padding: spacing.lg, gap: spacing.md, borderRadius: radii.card, backgroundColor: songGuessTokens.playerSurface },
  playerTopRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md },
  playerLabel: { ...typography.badge, color: songGuessTokens.playerText },
  playerDuration: { ...typography.display, color: songGuessTokens.playerText },
  playerTime: { ...typography.badge, color: songGuessTokens.playerText },
  progressTrack: { height: songGuessTokens.progressHeight, overflow: "hidden", borderRadius: radii.pill, backgroundColor: songGuessTokens.progressTrack },
  progressFill: { height: songGuessTokens.progressHeight, borderRadius: radii.pill, backgroundColor: songGuessTokens.progressFill },
  playerActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  playerButton: { flexGrow: 1, minWidth: tapMin * 2 },
  playerError: { ...typography.badge, color: songGuessTokens.playerText },
  clueCard: { padding: spacing.lg, gap: spacing.xs, borderWidth: borders.hairline, borderColor: songGuessTokens.clueBorder, borderRadius: radii.card, backgroundColor: songGuessTokens.clueSurface },
  clueLabel: { ...typography.badge, color: songGuessTokens.clueText },
  clueText: { ...typography.body, color: songGuessTokens.clueText },
  guessCard: { padding: spacing.lg, gap: spacing.md, borderWidth: borders.hairline, borderColor: songGuessTokens.panelBorder, borderRadius: radii.card, backgroundColor: songGuessTokens.panelSurface },
  sectionTitle: { ...typography.subtitle, color: songGuessTokens.text },
  sectionDescription: { ...typography.body, color: songGuessTokens.mutedText },
  resultCard: { padding: spacing.lg, gap: spacing.xs, borderRadius: radii.card },
  resultSuccess: { backgroundColor: songGuessTokens.successSurface },
  resultMiss: { backgroundColor: songGuessTokens.errorSurface },
  resultTitle: { ...typography.subtitle },
  resultBody: { ...typography.body },
  successText: { color: songGuessTokens.successText },
  missText: { color: songGuessTokens.errorText },
  answerCard: { padding: spacing.xl, gap: spacing.xs, alignItems: "center", borderRadius: radii.card, backgroundColor: songGuessTokens.accentSurface },
  answerLabel: { ...typography.badge, color: songGuessTokens.accentText },
  answerText: { ...typography.display, color: songGuessTokens.text, textAlign: "center" },
  scoreCard: { padding: spacing.lg, gap: spacing.sm, borderWidth: borders.hairline, borderColor: songGuessTokens.panelBorder, borderRadius: radii.card, backgroundColor: songGuessTokens.panelSurface },
  scoreRow: { minHeight: tapMin, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderTopWidth: borders.hairline, borderTopColor: songGuessTokens.scoreDivider },
  rank: { ...typography.subtitle, width: spacing.xxl, color: songGuessTokens.accentText },
  playerName: { ...typography.body, flex: 1, color: songGuessTokens.text },
  score: { ...typography.subtitle, color: songGuessTokens.text },
  actions: { gap: spacing.sm },
  muted: { ...typography.body, color: songGuessTokens.mutedText, textAlign: "center" },
  noticeText: { ...typography.body, padding: spacing.md, borderRadius: radii.control, color: songGuessTokens.successText, backgroundColor: songGuessTokens.successSurface },
  errorText: { ...typography.body, padding: spacing.md, borderRadius: radii.control, color: songGuessTokens.errorText, backgroundColor: songGuessTokens.errorSurface },
});
