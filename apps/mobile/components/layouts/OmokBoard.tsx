import { useCallback, useEffect, useRef, useState } from "react";
import { type Href, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeWindowDimensions } from "../../hooks/use-safe-window-dimensions";
import type { BoardDetailResponse } from "../../lib/types";
import { ApiError } from "../../lib/api";
import {
  cancelOmokMatch,
  fetchOmokMatchmaking,
  requestOmokMatch,
  type OmokMatchmakingStatus,
} from "../../lib/play-platform";
import { omokBoardFrame } from "../../lib/omok-geometry";
import { canPlaceStone, projectPendingBoard } from "../../lib/omok-move-machine";
import {
  omokConnectionNotice,
  omokHintText,
  omokTurnBanner,
} from "../../lib/omok-presentation";
import {
  omokHttpErrorMessage,
  useOmokSessionRuntime,
} from "../../lib/omok-session-runtime";
import { useBoardRealtime } from "../../lib/use-board-realtime";
import {
  colors,
  omokTokens,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import { AppButton, EmptyState } from "../ui";
import { OmokGrid } from "./omok/OmokGrid";
import { OmokHud, OmokTurnBar } from "./omok/OmokHud";
import { OmokTerminalPanel } from "./omok/OmokTerminalPanel";

const MATCHMAKING_HEARTBEAT_MS = 15_000;

export function OmokBoard({ data }: { data: BoardDetailResponse }) {
  const router = useRouter();
  const boardId = data.board.id;
  const matchmakingEnabled =
    data.board.systemGameKind === "omok" || data.board.slug.startsWith("game-hub-omok-");
  const [matchmaking, setMatchmaking] = useState<OmokMatchmakingStatus>({
    status: "idle",
    playerCount: 0,
  });
  const [matchmakingLoading, setMatchmakingLoading] = useState(matchmakingEnabled);
  const [matchmakingBusy, setMatchmakingBusy] = useState(false);
  const [matchmakingError, setMatchmakingError] = useState<string | null>(null);
  const sequenceRef = useRef(0);
  const matchmakingRefreshRef = useRef<Promise<void> | null>(null);
  const { width, height } = useSafeWindowDimensions();

  // A non-canonical board that the actor cannot read returns to the play list
  // rather than showing an error surface.
  const handleUnauthorized = useCallback(() => {
    if (matchmakingEnabled) return;
    router.replace("/(student)/boards?filter=play" as Href);
  }, [matchmakingEnabled, router]);

  const runtime = useOmokSessionRuntime({
    boardId,
    onPlacementFeedback: () => undefined,
    onUnauthorized: handleUnauthorized,
  });
  const { state, socketStatus, offline } = runtime;
  const snapshot = state.snapshot;

  const acceptMatchmaking = useCallback(
    (next: OmokMatchmakingStatus) => {
      setMatchmaking(next);
      if (next.status === "matched" && next.boardSlug) {
        router.replace(
          `/(student)/board/${encodeURIComponent(next.boardSlug)}?layout=omok` as Href,
        );
      }
    },
    [router],
  );

  const refreshMatchmaking = useCallback(() => {
    const inFlight = matchmakingRefreshRef.current;
    if (inFlight) return inFlight;

    const task = (async () => {
      const sequence = ++sequenceRef.current;
      try {
        const next = await fetchOmokMatchmaking(boardId);
        if (sequence !== sequenceRef.current) return;
        acceptMatchmaking(next);
        setMatchmakingError(null);
      } catch (cause) {
        if (sequence !== sequenceRef.current) return;
        setMatchmakingError(omokHttpErrorMessage(cause));
      } finally {
        if (sequence === sequenceRef.current) setMatchmakingLoading(false);
      }
    })();
    matchmakingRefreshRef.current = task;
    void task.finally(() => {
      if (matchmakingRefreshRef.current === task) {
        matchmakingRefreshRef.current = null;
      }
    });
    return task;
  }, [acceptMatchmaking, boardId]);

  useEffect(() => {
    if (matchmakingEnabled) void refreshMatchmaking();
  }, [matchmakingEnabled, refreshMatchmaking]);

  // Supabase board realtime stays an invalidation source for lobby/matchmaking
  // state. Rust game-socket health is tracked separately by the runtime.
  useBoardRealtime({
    slug: boardId,
    onReload: matchmakingEnabled ? refreshMatchmaking : runtime.refresh,
  });

  useEffect(() => {
    if (!matchmakingEnabled || matchmaking.status !== "waiting") return;
    const timer = setInterval(() => {
      void refreshMatchmaking();
    }, MATCHMAKING_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [matchmaking.status, matchmakingEnabled, refreshMatchmaking]);

  const startMatchmaking = useCallback(
    async (opponent: "human" | "computer") => {
      if (!matchmakingEnabled || matchmakingBusy) return;
      setMatchmakingBusy(true);
      setMatchmakingError(null);
      try {
        acceptMatchmaking(await requestOmokMatch(boardId, opponent));
      } catch (cause) {
        setMatchmakingError(omokHttpErrorMessage(cause));
      } finally {
        setMatchmakingBusy(false);
      }
    },
    [acceptMatchmaking, boardId, matchmakingBusy, matchmakingEnabled],
  );

  const stopMatchmaking = useCallback(async () => {
    if (!matchmakingEnabled || matchmakingBusy) return;
    setMatchmakingBusy(true);
    setMatchmakingError(null);
    try {
      acceptMatchmaking(await cancelOmokMatch(boardId));
    } catch (cause) {
      setMatchmakingError(omokHttpErrorMessage(cause));
    } finally {
      setMatchmakingBusy(false);
    }
  }, [acceptMatchmaking, boardId, matchmakingBusy, matchmakingEnabled]);

  const confirmResign = useCallback(() => {
    Alert.alert("기권할까요?", "지금 기권하면 상대의 승리로 끝나요.", [
      { text: "취소", style: "cancel" },
      {
        text: "기권하기",
        style: "destructive",
        onPress: () => runtime.sendIntent({ type: "resign" }),
      },
    ]);
  }, [runtime]);

  const leaveGame = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(student)/boards?filter=play" as Href);
  }, [router]);

  if (runtime.loading || (matchmakingEnabled && matchmakingLoading && !snapshot)) {
    return (
      <View style={styles.center} accessibilityLiveRegion="polite">
        <ActivityIndicator />
        <Text style={styles.muted}>대국을 불러오는 중이에요…</Text>
      </View>
    );
  }

  if (!snapshot) {
    if (matchmakingEnabled) {
      const waiting = matchmaking.status === "waiting";
      return (
        <ScrollView contentContainerStyle={styles.matchContainer}>
          <View style={styles.matchCard}>
            <Text style={styles.eyebrow}>온라인 오목</Text>
            <Text style={styles.matchTitle}>
              {waiting ? "친구를 찾는 중" : "오목 매칭"}
            </Text>
            <Text style={styles.matchMessage} accessibilityLiveRegion="polite">
              {waiting
                ? `현재 ${matchmaking.playerCount}명이 매칭에 참여 중이에요.`
                : "같은 학급 친구를 찾거나 컴퓨터와 바로 대국할 수 있어요."}
            </Text>
            <View style={styles.matchActions}>
              {waiting ? (
                <>
                  <AppButton
                    variant="secondary"
                    disabled={matchmakingBusy}
                    onPress={() => void stopMatchmaking()}
                  >
                    {matchmakingBusy ? "처리 중…" : "매칭 취소"}
                  </AppButton>
                  <AppButton
                    disabled={matchmakingBusy}
                    onPress={() => void startMatchmaking("computer")}
                  >
                    컴퓨터와 바로 대국
                  </AppButton>
                </>
              ) : (
                <>
                  <AppButton
                    disabled={matchmakingBusy}
                    onPress={() => void startMatchmaking("human")}
                  >
                    {matchmakingBusy ? "처리 중…" : "친구 매칭"}
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    disabled={matchmakingBusy}
                    onPress={() => void startMatchmaking("computer")}
                  >
                    컴퓨터와 대국
                  </AppButton>
                </>
              )}
            </View>
            {matchmakingError ? <Text style={styles.error}>{matchmakingError}</Text> : null}
          </View>
        </ScrollView>
      );
    }
    return (
      <ScrollView contentContainerStyle={styles.emptyContainer}>
        <EmptyState
          icon={<Text style={styles.emptyIcon}>⚫</Text>}
          title="대국 준비 중"
          description="교사가 상대를 정하면 이 화면에 자동으로 오목판이 나타나요."
        />
        {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
        <AppButton variant="secondary" onPress={() => void runtime.refresh()}>
          최신 상태 확인
        </AppButton>
      </ScrollView>
    );
  }

  const me = snapshot.viewer.slot
    ? snapshot.participants.find((participant) => participant.slot === snapshot.viewer.slot)
    : null;
  const terminal = snapshot.roomStatus === "finished";
  const board = projectPendingBoard(state) ?? snapshot.game.board;
  const frame = omokBoardFrame({
    width,
    height,
    reservedHeight: omokTokens.reservedHeight,
    horizontalPadding: spacing.md,
    maxEdge: omokTokens.boardMaxEdge,
    minEdge: omokTokens.boardMinEdge,
  });
  const banner = omokTurnBanner(state);
  const hint = omokHintText(state);
  const notice = omokConnectionNotice(socketStatus, {
    httpRecovering: offline,
    offline,
  });
  const boardEnabled = !terminal && !state.pending && canPlaceStone(snapshot);

  // No scroll view: the board and its chrome are sized to the viewport.
  return (
    <View style={styles.gameRoot}>
      <OmokHud snapshot={snapshot} />
      <OmokTurnBar banner={banner} />

      <OmokGrid
        board={board}
        frame={frame}
        aim={state.aim}
        pendingStone={state.pending?.stone ?? null}
        lastMove={snapshot.game.lastMove?.position ?? null}
        enabled={boardEnabled}
        onAim={runtime.aim}
      />

      {hint ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {hint}
        </Text>
      ) : null}

      {terminal ? (
        <OmokTerminalPanel
          snapshot={snapshot}
          busy={runtime.busy}
          canRematch={snapshot.viewer.capabilities.canRematch}
          onLeave={leaveGame}
          onRematch={runtime.rematch}
        />
      ) : (
        <View style={styles.actionRow}>
          {state.aim ? (
            <>
              <AppButton style={styles.actionButton} onPress={runtime.confirm}>
                여기에 두기
              </AppButton>
              <AppButton
                variant="secondary"
                style={styles.actionButton}
                onPress={runtime.cancelAim}
              >
                취소
              </AppButton>
            </>
          ) : snapshot.roomStatus === "waiting" && !me?.ready ? (
            <AppButton
              style={styles.actionButton}
              disabled={!!state.pending}
              onPress={() => runtime.sendIntent({ type: "ready" })}
            >
              준비 완료
            </AppButton>
          ) : snapshot.roomStatus === "active" ? (
            <AppButton
              variant="danger"
              style={styles.actionButton}
              disabled={!!state.pending}
              onPress={confirmResign}
            >
              기권
            </AppButton>
          ) : null}
        </View>
      )}

      {notice ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
      {state.error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {state.error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /** The active game fills the shell and never scrolls. */
  gameRoot: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: omokTokens.pageBg,
  },
  hint: {
    ...typography.body,
    color: omokTokens.statusHint,
    textAlign: "center",
  },
  notice: {
    ...typography.label,
    color: omokTokens.noticeText,
    backgroundColor: omokTokens.noticeSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: omokTokens.noticeBorder,
    borderRadius: radii.control,
    padding: spacing.sm,
    textAlign: "center",
    overflow: "hidden",
  },
  actionRow: {
    flexDirection: "row",
    gap: omokTokens.confirmGap,
  },
  /** Confirm and cancel are separate, non-overlapping >=44dp targets. */
  actionButton: {
    flex: 1,
    minHeight: omokTokens.confirmMinHeight,
  },
  center: {
    flex: 1,
    minHeight: omokTokens.loadingMinHeight,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: omokTokens.pageBg,
  },
  emptyContainer: {
    flexGrow: 1,
    minHeight: omokTokens.emptyMinHeight,
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: omokTokens.pageBg,
  },
  matchContainer: {
    flexGrow: 1,
    minHeight: omokTokens.emptyMinHeight,
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: omokTokens.pageBg,
  },
  matchCard: {
    width: "100%",
    maxWidth: omokTokens.matchMaxWidth,
    alignSelf: "center",
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: omokTokens.panelBorder,
    backgroundColor: omokTokens.panelSurface,
  },
  matchTitle: {
    ...typography.title,
    color: omokTokens.text,
  },
  matchMessage: {
    ...typography.body,
    color: omokTokens.statusHint,
  },
  connectionText: {
    ...typography.micro,
    color: omokTokens.statusLabel,
    fontWeight: "800",
  },
  matchActions: { gap: spacing.sm },
  muted: { ...typography.body, color: colors.textMuted },
  emptyIcon: { fontSize: omokTokens.emptyIconSize },
  eyebrow: {
    ...typography.micro,
    color: omokTokens.eyebrow,
    fontWeight: "800",
    letterSpacing: omokTokens.eyebrowLetterSpacing,
  },
  error: {
    ...typography.body,
    color: omokTokens.errorText,
    backgroundColor: omokTokens.errorBg,
    padding: spacing.md,
    borderRadius: radii.control,
    fontWeight: "700",
  },
});
