import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { BoardDetailResponse } from "../../lib/types";
import { ApiError } from "../../lib/api";
import {
  clearPendingOmokCommand,
  fetchCurrentOmokSession,
  isOmokSnapshot,
  loadPendingOmokCommand,
  makeOmokCommand,
  mergeOmokCommandSnapshot,
  playApiError,
  savePendingOmokCommand,
  submitOmokCommand,
  type OmokIntent,
  type OmokSlot,
  type OmokSnapshot,
  type PendingOmokCommand,
} from "../../lib/play-platform";
import {
  BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS,
  shouldUseBoardFallbackPolling,
  useBoardRealtime,
} from "../../lib/use-board-realtime";
import {
  colors,
  omokTokens,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import { AppButton, BarePressable, EmptyState } from "../ui";

const STAR_POINTS = new Set(["3:3", "3:11", "7:7", "11:3", "11:11"]);

export function OmokBoard({ data }: { data: BoardDetailResponse }) {
  const boardId = data.board.id;
  const [snapshot, setSnapshot] = useState<OmokSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const sequenceRef = useRef(0);
  const retriedRef = useRef<string | null>(null);
  const { width } = useWindowDimensions();
  const cellSize = Math.max(20, Math.min(29, Math.floor((width - 40) / 15)));

  const refresh = useCallback(async () => {
    const sequence = ++sequenceRef.current;
    setSyncing(true);
    try {
      const next = await fetchCurrentOmokSession(boardId);
      if (sequence !== sequenceRef.current) return;
      setSnapshot(next);
      setError(null);
      const pending = await loadPendingOmokCommand(boardId);
      if (sequence !== sequenceRef.current) return;
      setHasPending(!!pending && pending.sessionId === next?.sessionId);
    } catch (cause) {
      if (sequence !== sequenceRef.current) return;
      setError(messageForError(cause));
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
    const timer = setInterval(() => {
      void refresh();
    }, BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [realtime.status, refresh]);

  const executePending = useCallback(
    async (pending: PendingOmokCommand, persist = true) => {
      if (persist) {
        await savePendingOmokCommand(boardId, pending).catch(() => undefined);
      }
      setHasPending(true);
      setBusy(true);
      setError(null);
      try {
        const response = await submitOmokCommand(pending.sessionId, pending.request);
        setSnapshot((current) =>
          mergeOmokCommandSnapshot(current, pending.sessionId, response.snapshot),
        );
        await clearPendingOmokCommand(boardId).catch(() => undefined);
        setHasPending(false);
      } catch (cause) {
        const apiBody = playApiError(cause);
        if (cause instanceof ApiError && cause.status === 409 && isOmokSnapshot(apiBody?.snapshot)) {
          setSnapshot((current) =>
            mergeOmokCommandSnapshot(current, pending.sessionId, apiBody.snapshot!),
          );
          await clearPendingOmokCommand(boardId).catch(() => undefined);
          setHasPending(false);
          setError("다른 화면에서 상태가 먼저 바뀌어 최신 판으로 맞췄어요.");
        } else {
          if (cause instanceof ApiError && cause.status < 500 && cause.status !== 408) {
            await clearPendingOmokCommand(boardId).catch(() => undefined);
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
    void loadPendingOmokCommand(boardId).then((pending) => {
      if (
        cancelled ||
        !pending ||
        pending.sessionId !== snapshot.sessionId ||
        retriedRef.current === pending.request.requestId
      ) {
        return;
      }
      retriedRef.current = pending.request.requestId;
      void executePending(pending, false);
    });
    return () => {
      cancelled = true;
    };
  }, [boardId, busy, executePending, snapshot]);

  const sendIntent = useCallback(
    (command: OmokIntent) => {
      if (!snapshot || busy || syncing) return;
      void executePending({
        sessionId: snapshot.sessionId,
        request: makeOmokCommand(snapshot, command),
      });
    },
    [busy, executePending, snapshot, syncing],
  );

  if (loading) {
    return (
      <View style={styles.center} accessibilityLiveRegion="polite">
        <ActivityIndicator />
        <Text style={styles.muted}>권위 게임 상태를 불러오는 중이에요…</Text>
      </View>
    );
  }

  if (!snapshot) {
    return (
      <ScrollView contentContainerStyle={styles.emptyContainer}>
        <EmptyState
          icon={<Text style={styles.emptyIcon}>⚫</Text>}
          title="대국 준비 중"
          description="교사가 상대를 정하면 이 화면에 자동으로 오목판이 나타나요."
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AppButton variant="secondary" onPress={() => void refresh()}>
          최신 상태 확인
        </AppButton>
      </ScrollView>
    );
  }

  const me = snapshot.viewer.slot
    ? snapshot.participants.find((participant) => participant.slot === snapshot.viewer.slot)
    : null;
  const nextPlayer = snapshot.participants.find(
    (participant) => participant.slot === snapshot.game.nextTurn,
  );
  const canPlace =
    snapshot.viewer.role === "participant" &&
    snapshot.roomStatus === "active" &&
    snapshot.viewer.slot === snapshot.game.nextTurn &&
    !busy &&
    !syncing;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <View style={styles.heroText}>
          <Text style={styles.eyebrow}>AUTHORITATIVE OMOK</Text>
          <Text style={styles.title}>{data.board.title || "권위 오목"}</Text>
        </View>
        <View style={styles.versionPill}>
          <Text style={styles.versionText}>v{snapshot.version}</Text>
          <Text style={styles.versionSub}>{syncing ? "동기화 중" : "동기화됨"}</Text>
        </View>
      </View>

      <View style={styles.statusCard} accessibilityLiveRegion="polite">
        <Text style={styles.statusLabel}>진행 상태</Text>
        <Text style={styles.statusValue}>{describeStatus(snapshot, nextPlayer?.displayName ?? null)}</Text>
        <Text style={styles.statusHint}>{actionHint(snapshot)}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardScroll}>
        <View
          style={[
            styles.board,
            { width: cellSize * 15 + 8, height: cellSize * 15 + 8 },
          ]}
        >
          {snapshot.game.board.map((cell, index) => {
            const row = Math.floor(index / 15);
            const column = index % 15;
            const last =
              snapshot.game.lastMove?.position.row === row &&
              snapshot.game.lastMove.position.column === column;
            const enabled = canPlace && cell === null;
            return (
              <BarePressable
                key={`${row}:${column}`}
                accessibilityRole="button"
                accessibilityLabel={`${row + 1}행 ${column + 1}열${cell ? `, ${slotLabel(cell)} 돌` : ", 빈 칸"}`}
                accessibilityState={{ disabled: !enabled }}
                disabled={!enabled}
                onPress={() =>
                  sendIntent({ type: "place_stone", position: { row, column } })
                }
                style={[
                  styles.cell,
                  { width: cellSize, height: cellSize },
                ]}
              >
                {STAR_POINTS.has(`${row}:${column}`) && !cell ? <View style={styles.star} /> : null}
                {cell ? (
                  <View
                    style={[
                      styles.stone,
                      cell === "first" ? styles.blackStone : styles.whiteStone,
                      last ? styles.lastStone : null,
                      { width: cellSize * 0.78, height: cellSize * 0.78 },
                    ]}
                  />
                ) : null}
              </BarePressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.playersCard}>
        <Text style={styles.sectionTitle}>대국 참가자</Text>
        {snapshot.participants.map((participant) => (
          <View style={styles.playerRow} key={participant.slot}>
            <View style={styles.playerIdentity}>
              <View
                style={[
                  styles.playerStone,
                  participant.slot === "first" ? styles.blackStone : styles.whiteStone,
                ]}
              />
              <Text style={styles.playerName} numberOfLines={1}>
                {participant.displayName}
                {participant.slot === snapshot.viewer.slot ? " (나)" : ""}
              </Text>
            </View>
            <Text style={styles.readyBadge}>{participant.ready ? "준비됨" : "대기"}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        {snapshot.roomStatus === "waiting" && !me?.ready ? (
          <AppButton
            disabled={busy || syncing}
            onPress={() => sendIntent({ type: "ready" })}
          >
            준비 완료
          </AppButton>
        ) : null}
        {snapshot.roomStatus === "active" ? (
          <AppButton
            variant="danger"
            disabled={busy || syncing}
            onPress={() => sendIntent({ type: "resign" })}
          >
            기권하기
          </AppButton>
        ) : null}
        {hasPending ? (
          <AppButton
            variant="secondary"
            disabled={busy}
            onPress={() => {
              void loadPendingOmokCommand(boardId).then((pending) => {
                if (pending) void executePending(pending, false);
              });
            }}
          >
            미확인 요청 다시 보내기
          </AppButton>
        ) : null}
        <AppButton
          variant="secondary"
          disabled={busy || syncing}
          onPress={() => void refresh()}
        >
          최신 상태 확인
        </AppButton>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function slotLabel(slot: OmokSlot | null): string {
  if (slot === "first") return "흑";
  if (slot === "second") return "백";
  return "관전자";
}

function describeStatus(snapshot: OmokSnapshot, turnName: string | null): string {
  switch (snapshot.roomStatus) {
    case "waiting":
      return `준비 대기 · ${snapshot.participants.filter((participant) => participant.ready).length}/2`;
    case "ready":
      return "두 참가자 준비 완료";
    case "active":
      return `${turnName ?? slotLabel(snapshot.game.nextTurn)} 차례`;
    case "finished": {
      if (!snapshot.outcome?.winner) return "무승부";
      const winner = snapshot.participants.find(
        (participant) => participant.slot === snapshot.outcome?.winner,
      );
      return `${winner?.displayName ?? slotLabel(snapshot.outcome.winner)} 승리`;
    }
  }
}

function actionHint(snapshot: OmokSnapshot): string {
  if (snapshot.roomStatus === "waiting") return "준비 완료를 누르면 교사가 대국을 시작할 수 있어요.";
  if (snapshot.roomStatus === "ready") return "교사가 곧 대국을 시작합니다.";
  if (snapshot.roomStatus === "active") {
    return snapshot.viewer.slot === snapshot.game.nextTurn
      ? "내 차례예요. 빈 교차점을 선택해 주세요."
      : "상대 차례예요. 판은 자동으로 최신 상태를 불러옵니다.";
  }
  if (snapshot.outcome?.reason === "resignation") return "기권으로 대국이 종료됐습니다.";
  if (snapshot.outcome?.reason === "draw") return "무승부로 대국이 종료됐습니다.";
  return "다섯 돌이 이어져 대국이 종료됐습니다.";
}

function messageForError(error: unknown): string {
  const body = playApiError(error);
  switch (body?.error) {
    case "invalid_phase":
      return "지금 단계에서는 그 동작을 할 수 없어요. 최신 상태를 확인해 주세요.";
    case "domain_rejected":
      return "그 자리는 둘 수 없거나 내 차례가 아니에요.";
    case "forbidden":
      return "이 대국에 참여할 권한이 없어요.";
    case "play_engine_unavailable":
      return "게임 서버 연결이 불안정해요. 같은 요청으로 다시 시도할 수 있어요.";
    default:
      return "연결을 확인해 주세요. 미확인 요청은 안전하게 다시 보낼 수 있어요.";
  }
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
    backgroundColor: omokTokens.pageBg,
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
  muted: { ...typography.body, color: colors.textMuted },
  emptyIcon: { fontSize: omokTokens.emptyIconSize },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  heroText: { flex: 1 },
  eyebrow: {
    ...typography.micro,
    color: omokTokens.eyebrow,
    fontWeight: "800",
    letterSpacing: omokTokens.eyebrowLetterSpacing,
  },
  title: { ...typography.title, color: omokTokens.text },
  versionPill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: omokTokens.versionSurface,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: omokTokens.versionBorder,
  },
  versionText: {
    ...typography.micro,
    color: omokTokens.versionText,
    fontWeight: "800",
  },
  versionSub: {
    fontSize: omokTokens.versionSubtextSize,
    color: omokTokens.versionSubtext,
  },
  statusCard: {
    borderRadius: radii.card,
    backgroundColor: omokTokens.panelSurface,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: omokTokens.panelBorder,
    gap: spacing.xs,
  },
  statusLabel: {
    ...typography.micro,
    color: omokTokens.statusLabel,
    fontWeight: "800",
  },
  statusValue: {
    ...typography.subtitle,
    color: omokTokens.text,
    fontWeight: "900",
  },
  statusHint: { ...typography.body, color: omokTokens.statusHint },
  boardScroll: {
    paddingHorizontal: spacing.xxs,
    paddingVertical: spacing.sm,
  },
  board: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: omokTokens.boardBorderWidth,
    borderColor: omokTokens.boardBorder,
    borderRadius: radii.control,
    overflow: "hidden",
    backgroundColor: omokTokens.boardWood,
  },
  cell: {
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: omokTokens.boardGrid,
  },
  star: {
    width: omokTokens.starSize,
    height: omokTokens.starSize,
    borderRadius: radii.pill,
    backgroundColor: omokTokens.star,
  },
  stone: { borderRadius: radii.pill },
  blackStone: {
    backgroundColor: omokTokens.blackStone,
    borderColor: omokTokens.blackStoneBorder,
  },
  whiteStone: {
    backgroundColor: omokTokens.whiteStone,
    borderWidth: omokTokens.whiteStoneBorderWidth,
    borderColor: omokTokens.whiteStoneBorder,
  },
  lastStone: {
    borderWidth: omokTokens.lastMoveBorderWidth,
    borderColor: omokTokens.lastMove,
  },
  playersCard: {
    borderRadius: radii.card,
    backgroundColor: omokTokens.panelSurface,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: omokTokens.panelBorder,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: omokTokens.text,
    marginBottom: spacing.sm,
  },
  playerRow: {
    minHeight: omokTokens.playerRowMinHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: omokTokens.playerDivider,
  },
  playerIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  playerStone: {
    width: omokTokens.playerStoneSize,
    height: omokTokens.playerStoneSize,
    borderRadius: radii.pill,
  },
  playerName: {
    ...typography.body,
    flex: 1,
    color: omokTokens.text,
    fontWeight: "800",
  },
  readyBadge: {
    ...typography.badge,
    color: omokTokens.readyText,
    backgroundColor: omokTokens.readyBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  actions: { gap: spacing.sm },
  error: {
    ...typography.body,
    color: omokTokens.errorText,
    backgroundColor: omokTokens.errorBg,
    padding: spacing.md,
    borderRadius: radii.control,
    fontWeight: "700",
  },
});
