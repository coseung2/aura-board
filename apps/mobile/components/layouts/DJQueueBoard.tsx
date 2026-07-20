import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  borders,
  colors,
  dj,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import {
  BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS,
  shouldUseBoardFallbackPolling,
  useBoardRealtime,
} from "../../lib/use-board-realtime";
import type { BoardDetailResponse, BoardCard } from "../../lib/types";
import {
  withBoardAnonymousAuthor,
  withBoardAnonymousAuthors,
} from "../../lib/card-privacy";
import { DJRecapModal } from "../DJRecapModal";
import { AppBottomSheet, AppButton, TextField } from "../ui";
import { deriveQueueState, mergeQueueSnapshot } from "./dj-queue-state";
import { DJQueueRanking } from "./DJQueueRanking";
import { DJNowPlayingCard } from "./DJNowPlayingCard";
import { DJQueueItem } from "./DJQueueItem";
import { DJPlayedDrawer } from "./DJPlayedDrawer";

// DJ 큐 보드 — 웹 디자인 핸드오프 DJBoardPage.jsx 를 네이티브로 이식.
//   [헤더: 제목 + 카운트 + 재생완료 토글]
//   [NOW PLAYING 카드 (전체 폭)]
//   [2열] 대기열 카드 | 사이드 (신청폼 + 랭킹)
//   + 재생완료 드로어 = AppModal side panel
//
// Drag-drop 재정렬은 RN 에서 무겁기에 ↑↓ 버튼으로 대체.
// SSE 폴링은 vibe-arcade 처럼 2초 polling (간단성).

type QueueStatus = "pending" | "approved" | "rejected" | "played";

export function DJQueueBoard({
  data,
  onMutate,
}: {
  data: BoardDetailResponse;
  onMutate: () => void;
}) {
  const [cards, setCards] = useState<BoardCard[]>(() =>
    withBoardAnonymousAuthors(data.cards, data.board),
  );
  const [submitUrl, setSubmitUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [queueSheetOpen, setQueueSheetOpen] = useState(false);
  const [playedOpen, setPlayedOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const pendingIds = useRef<Set<string>>(new Set());
  const boardId = data.board.id;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < dj.compactBreakpoint;
  const canControl = data.capabilities?.canControlQueue === true;

  // Parent refreshes replace `data` after queue_changed/card_changed. Merge
  // that snapshot into the local optimistic queue instead of keeping only the
  // initial mount data.
  useEffect(() => {
    const incoming = withBoardAnonymousAuthors(data.cards, data.board);
    setCards((local) =>
      mergeQueueSnapshot(incoming, local, pendingIds.current),
    );
  }, [data.cards, data.board]);

  // 실시간: queue_changed/card_changed broadcast 가 오면 부모 refetch.
  // 서버 channel key 가 board.id 기준이므로 id 로 구독해야 한다.
  const { status: realtimeStatus } = useBoardRealtime({
    slug: data.board.id,
    onReload: onMutate,
  });

  // Realtime이 불가능할 때만 15초 스냅샷으로 교사의 승인/재생 완료를 보정한다.
  useEffect(() => {
    if (!shouldUseBoardFallbackPolling(realtimeStatus)) return;
    const handle = setInterval(async () => {
      try {
        const res = await apiFetch<BoardDetailResponse>(
          `/api/student/board/${encodeURIComponent(data.board.slug)}`,
        );
        const incoming = withBoardAnonymousAuthors(res.cards, res.board);
        setCards((prev) =>
          mergeQueueSnapshot(incoming, prev, pendingIds.current),
        );
      } catch {
        // swallow — next tick.
      }
    }, BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [data.board.slug, realtimeStatus]);

  const {
    activeQueue,
    playedCards,
    nowPlaying,
    upNext,
    pendingCount,
    approvedCount,
    ranking,
  } = useMemo(
    () =>
      deriveQueueState(
        cards,
        canControl,
        dj.rankingLimit,
        data.board.anonymousAuthor === true,
      ),
    [cards, canControl, data.board.anonymousAuthor],
  );

  async function trackMutation<T>(
    id: string,
    run: () => Promise<T>,
  ): Promise<T> {
    pendingIds.current.add(id);
    try {
      return await run();
    } finally {
      pendingIds.current.delete(id);
    }
  }

  async function handleSubmit() {
    const url = submitUrl.trim();
    if (!url) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { card } = await apiFetch<{ card: BoardCard }>(
        `/api/boards/${encodeURIComponent(boardId)}/queue`,
        { method: "POST", json: { youtubeUrl: url } },
      );
      setCards((prev) => [...prev, withBoardAnonymousAuthor(card, data.board)]);
      setSubmitUrl("");
      setQueueSheetOpen(false);
      onMutate();
    } catch (e) {
      if (e instanceof ApiError) {
        const body = e.body as { error?: string } | string;
        setSubmitError(
          typeof body === "object" && body?.error
            ? body.error
            : `제출 실패 (${e.status})`,
        );
      } else {
        setSubmitError(e instanceof Error ? e.message : "제출 실패");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatus(cardId: string, status: QueueStatus) {
    if (!canControl) return;
    const prev = cards;
    setCards((list) =>
      list.map((c) => (c.id === cardId ? { ...c, queueStatus: status } : c)),
    );
    await trackMutation(cardId, async () => {
      try {
        await apiFetch(
          `/api/boards/${encodeURIComponent(boardId)}/queue/${cardId}`,
          {
            method: "PATCH",
            json: { status },
          },
        );
        onMutate();
      } catch (e) {
        setCards(prev);
        Alert.alert(
          "변경 실패",
          e instanceof Error ? e.message : "대기열 상태를 바꾸지 못했어요.",
        );
      }
    });
  }

  async function handleDelete(cardId: string) {
    // 교사/DJ 는 항상 삭제 가능. 학생은 본인 pending 신청일 때만 삭제 가능.
    const target = cards.find((c) => c.id === cardId);
    const isOwnPending = target?.isOwnPendingQueue === true;
    if (!canControl && !isOwnPending) return;
    Alert.alert("곡 삭제", "이 곡을 삭제할까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          const prev = cards;
          setCards((list) => list.filter((c) => c.id !== cardId));
          await trackMutation(cardId, async () => {
            try {
              await apiFetch(
                `/api/boards/${encodeURIComponent(boardId)}/queue/${cardId}`,
                {
                  method: "DELETE",
                },
              );
              onMutate();
            } catch (e) {
              setCards(prev);
              Alert.alert(
                "삭제 실패",
                e instanceof Error ? e.message : "곡을 삭제하지 못했어요.",
              );
            }
          });
        },
      },
    ]);
  }

  async function handleMove(cardId: string, direction: -1 | 1) {
    if (!canControl) return;
    const idx = activeQueue.findIndex((c) => c.id === cardId);
    if (idx < 0) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= activeQueue.length) return;
    const self = activeQueue[idx];
    const other = activeQueue[swapIdx];
    if (!self || !other) return;
    // 백엔드 move 는 "insert at N" 의미: order >= N 인 카드를 +1 후 자신을 N 으로
    // 세팅한다. swap 의 down 방향이면 N = other.order + 1 이면 자신(other 보다 한 칸 뒤)
    // 에 안착한다. up 방향이면 N = other.order 로 두면 other 가 +1 되어 자신 앞으로
    // 밀려난다.
    const targetOrder = (other.order ?? 0) + (direction > 0 ? 1 : 0);
    const prev = cards;
    setCards((list) =>
      list.map((c) => (c.id === self.id ? { ...c, order: targetOrder } : c)),
    );
    await trackMutation(self.id, async () => {
      try {
        await apiFetch(
          `/api/boards/${encodeURIComponent(boardId)}/queue/${self.id}/move`,
          { method: "PATCH", json: { order: targetOrder } },
        );
        onMutate();
      } catch (e) {
        setCards(prev);
        Alert.alert(
          "순서 변경 실패",
          e instanceof Error ? e.message : "대기열 순서를 바꾸지 못했어요.",
        );
      }
    });
  }

  async function handleRestore(cardId: string) {
    if (!canControl) return;
    const maxOrder = activeQueue.reduce((m, c) => Math.max(m, c.order ?? 0), 0);
    const targetOrder = maxOrder + 1;
    const prev = cards;
    setCards((list) =>
      list.map((c) =>
        c.id === cardId
          ? { ...c, queueStatus: "approved", order: targetOrder }
          : c,
      ),
    );
    await trackMutation(cardId, async () => {
      try {
        await Promise.all([
          apiFetch(
            `/api/boards/${encodeURIComponent(boardId)}/queue/${cardId}`,
            {
              method: "PATCH",
              json: { status: "approved" },
            },
          ),
          apiFetch(
            `/api/boards/${encodeURIComponent(boardId)}/queue/${cardId}/move`,
            { method: "PATCH", json: { order: targetOrder } },
          ),
        ]);
        onMutate();
      } catch (e) {
        setCards(prev);
        Alert.alert(
          "복귀 실패",
          e instanceof Error ? e.message : "곡을 대기열로 복귀하지 못했어요.",
        );
      }
    });
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.feed}
        contentContainerStyle={styles.feedContent}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.header, compact && styles.headerCompact]}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>🎧 {data.board.title}</Text>
            <Text style={styles.subtitle}>
              DJ 큐 · 대기 {pendingCount} · 승인 {approvedCount} · 재생 완료{" "}
              {playedCards.length}
            </Text>
          </View>
          <View
            style={[
              styles.headerActions,
              compact && styles.headerActionsCompact,
            ]}
          >
            <AppButton
              variant="secondary"
              style={styles.headerBtn}
              onPress={() => setRecapOpen(true)}
            >
              📊 이달의 리캡
            </AppButton>
            <AppButton
              variant="secondary"
              style={styles.headerBtn}
              onPress={() => setPlayedOpen(true)}
            >
              🕘 재생 완료 ({playedCards.length})
            </AppButton>
          </View>
        </View>

        {nowPlaying ? (
          <DJNowPlayingCard
            card={nowPlaying}
            compact={compact}
            canControl={canControl}
            onNext={() => handleStatus(nowPlaying.id, "played")}
          />
        ) : null}

        <View style={styles.feedSection}>
          <Text style={styles.sectionTitle}>곡 신청 · 대기열</Text>
          <AppButton
            variant="secondary"
            style={styles.menuAction}
            onPress={() => setQueueSheetOpen(true)}
          >
            ＋ 곡 신청 · 대기열 ({upNext.length})
          </AppButton>
          <Text style={styles.submitNote}>
            신청곡과 대기열은 아래 시트에서 확인할 수 있어요.
          </Text>
        </View>
        <DJQueueRanking
          items={ranking}
          hidden={data.board.anonymousAuthor === true}
        />
      </ScrollView>

      <AppBottomSheet
        visible={queueSheetOpen}
        onClose={() => setQueueSheetOpen(false)}
        sheetStyle={[
          styles.queueSheet,
          { paddingBottom: insets.bottom + spacing.md },
        ]}
        accessibilityLabel="곡 신청 및 대기열"
        keyboardAvoiding
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>곡 신청</Text>
          <Text style={styles.sheetDescription}>
            YouTube 링크를 보내 주세요.
          </Text>
        </View>
        <TextField
          style={styles.submitInput}
          placeholder="YouTube 링크"
          value={submitUrl}
          onChangeText={(text) => {
            setSubmitUrl(text);
            if (submitError) setSubmitError(null);
          }}
          editable={!submitting}
          onSubmitEditing={handleSubmit}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <AppButton
          style={styles.submitBtn}
          onPress={handleSubmit}
          disabled={!submitUrl.trim() || submitting}
          loading={submitting}
        >
          신청하기
        </AppButton>
        {submitError ? (
          <Text style={styles.submitError}>{submitError}</Text>
        ) : null}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>대기열</Text>
          <Text style={styles.sheetDescription}>
            {canControl
              ? "↑↓로 순서를 변경할 수 있어요."
              : "선생님이 승인하면 재생 목록에 올라갑니다."}
          </Text>
        </View>
        <FlatList
          data={upNext}
          keyExtractor={(card) => card.id}
          style={styles.queueSheetList}
          contentContainerStyle={styles.queueSheetContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => (
            <DJQueueItem
              card={item}
              rank={(nowPlaying ? 2 : 1) + index}
              onApprove={() => handleStatus(item.id, "approved")}
              onReject={() => handleStatus(item.id, "rejected")}
              onMarkPlayed={() => handleStatus(item.id, "played")}
              onDelete={() => handleDelete(item.id)}
              onMoveUp={() => handleMove(item.id, -1)}
              onMoveDown={() => handleMove(item.id, 1)}
              canMoveUp={index > 0 || !!nowPlaying}
              canMoveDown={index < upNext.length - 1}
              canControl={canControl}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {nowPlaying
                ? "다음 곡이 없습니다."
                : "신청곡이 없습니다. 첫 곡을 신청해 보세요."}
            </Text>
          }
        />
      </AppBottomSheet>

      <DJPlayedDrawer
        open={playedOpen}
        played={playedCards}
        canControl={canControl}
        onClose={() => setPlayedOpen(false)}
        onRestore={handleRestore}
        onDelete={handleDelete}
      />

      <DJRecapModal
        open={recapOpen}
        boardId={boardId}
        boardTitle={data.board.title}
        onClose={() => setRecapOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  feed: { flex: 1 },
  feedContent: { paddingBottom: spacing.xl },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  headerCompact: {
    flexDirection: "column",
  },
  headerCopy: { flex: 1 },
  headerActions: { flexDirection: "row", gap: spacing.sm },
  headerActionsCompact: {
    flexWrap: "wrap",
  },
  title: { ...typography.title, color: colors.text },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  headerBtn: {
    flexShrink: 0,
  },

  // Stream sections
  feedSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  sectionTitle: { ...typography.section, color: colors.text },
  menuAction: {
    marginTop: spacing.md,
  },
  sheetHeader: {
    gap: spacing.xxs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  sheetTitle: { ...typography.section, color: colors.text },
  sheetDescription: { ...typography.micro, color: colors.textMuted },
  submitInput: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
  },
  submitBtn: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  submitNote: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  submitError: {
    ...typography.micro,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  queueSheet: {
    height: "82%",
    maxHeight: "82%",
    minHeight: tapMin * 6,
  },
  queueSheetList: { flex: 1 },
  queueSheetContent: {
    paddingBottom: spacing.lg,
  },
  separator: {
    height: borders.hairline,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.border,
  },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    padding: spacing.xl,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
});
