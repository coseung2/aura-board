import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  borders,
  colors,
  dj,
  pageChrome,
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
import {
  ContentTab,
  ContentTabs,
  SectionNav,
  SectionNavItem,
} from "../NavigationTabs";
import {
  AppBottomSheet,
  AppButton,
  ControlPressable,
  TextField,
} from "../ui";
import {
  deriveQueueState,
  mergeQueueSnapshot,
} from "./dj-queue-state";
import { DJQueueRanking } from "./DJQueueRanking";
import { DJNowPlayingCard } from "./DJNowPlayingCard";
import { DJQueueItem } from "./DJQueueItem";
import { currentMonth } from "../dj-recap-state";

// DJ 큐 보드 — 웹 디자인 핸드오프 DJBoardPage.jsx 를 네이티브로 이식.
// Drag-drop 재정렬은 RN 에서 무겁기에 ↑↓ 버튼으로 대체.

type QueueStatus = "pending" | "approved" | "rejected" | "played";
type DJSection = "now" | "history";
type HistoryKind = "submitters" | "songs";

type QueueRankingSubmitter = {
  key: string;
  name: string;
  count: number;
  isStudent: boolean;
  isCurrentUser?: boolean;
};

type QueueRankingSong = {
  linkUrl: string;
  linkImage: string | null;
  title: string;
  count: number;
};

type QueueRankingResponse = {
  songs: QueueRankingSong[];
  submitters: QueueRankingSubmitter[];
  submittersHidden?: boolean;
};

function isInMonth(value: string, month: string): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const dateMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return dateMonth === month;
}

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
  const [activeSection, setActiveSection] = useState<DJSection>("now");
  const [historyKind, setHistoryKind] = useState<HistoryKind>("submitters");
  const pendingIds = useRef<Set<string>>(new Set());
  const boardId = data.board.id;
  const { width } = useWindowDimensions();
  const compact = width < dj.compactBreakpoint;
  const canControl = data.capabilities?.canControlQueue === true;
  const recapMonth = currentMonth();
  const [rankingData, setRankingData] =
    useState<QueueRankingResponse | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const ownSubmitterKey = `s:${data.currentStudent.id}`;
  const localMyPlayedCount = useMemo(
    () =>
      cards.filter(
        (card) =>
          card.isMine === true &&
          card.queueStatus === "played" &&
          isInMonth(card.updatedAt ?? card.createdAt, recapMonth),
      ).length,
    [cards, recapMonth],
  );
  const ownRankingSubmitter = useMemo(
    () =>
      rankingData?.submitters.find(
        (submitter) => submitter.key === ownSubmitterKey,
      ) ?? null,
    [ownSubmitterKey, rankingData],
  );
  const topSubmitters = useMemo(() => {
    if (data.board.anonymousAuthor || !rankingData) return [];
    return rankingData.submitters.slice(0, 5).map((submitter) => ({
      name: submitter.name,
      count: submitter.count,
    }));
  }, [data.board.anonymousAuthor, rankingData]);
  const topSongs = useMemo(() => {
    if (!rankingData) return [];
    return rankingData.songs.slice(0, 5).map((song) => ({
      name: song.title,
      count: song.count,
    }));
  }, [rankingData]);
  const myPlayedCount = ownRankingSubmitter?.count ?? localMyPlayedCount;

  useEffect(() => {
    if (activeSection !== "history") return;
    let cancelled = false;
    setRankingData(null);
    setRankingLoading(true);
    setRankingError(null);
    void apiFetch<QueueRankingResponse>(
      `/api/boards/${encodeURIComponent(boardId)}/queue/ranking`,
    )
      .then((response) => {
        if (!cancelled) {
          setRankingData({
            songs: Array.isArray(response.songs) ? response.songs : [],
            submitters: Array.isArray(response.submitters)
              ? response.submitters
              : [],
            submittersHidden:
              response.submittersHidden === true || data.board.anonymousAuthor,
          });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setRankingData(null);
        setRankingError(
          error instanceof ApiError
            ? `이번 달 신청 TOP 불러오기 실패 (${error.status})`
            : error instanceof Error
              ? error.message
              : "이번 달 신청 TOP을 불러올 수 없어요.",
        );
      })
      .finally(() => {
        if (!cancelled) setRankingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSection, boardId, data.board.anonymousAuthor]);

  const recentSubmissions = useMemo(
    () =>
      cards
        .filter(
          (card) =>
            (card.isMine === true || card.isOwnPendingQueue === true) &&
            Boolean(card.linkUrl ?? card.videoUrl),
        )
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
        )
        .slice(0, 5),
    [cards],
  );
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
    nowPlaying,
    upNext,
    pendingCount,
    approvedCount,
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

  async function submitQueueUrl(value: string) {
    const url = value.trim();
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

  async function handleSubmit() {
    await submitQueueUrl(submitUrl);
  }

  async function handleRecentSubmission(url: string) {
    if (submitting) return;
    setSubmitUrl(url);
    await submitQueueUrl(url);
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

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.feed}
        contentContainerStyle={styles.feedContent}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <ContentTabs
          style={styles.sectionNav}
          accessibilityLabel="DJ 보드 섹션 탐색"
        >
          <ContentTab
            style={styles.sectionNavItem}
            selected={activeSection === "now"}
            onPress={() => setActiveSection("now")}
            accessibilityLabel="현재 재생"
          >
            현재 재생
          </ContentTab>
          <ContentTab
            style={styles.sectionNavItem}
            selected={activeSection === "history"}
            onPress={() => setActiveSection("history")}
            accessibilityLabel="재생 기록"
          >
            재생 기록
          </ContentTab>
        </ContentTabs>

        {activeSection === "now" ? (
          <>
            {nowPlaying ? (
              <DJNowPlayingCard
                card={nowPlaying}
                compact={compact}
                canControl={canControl}
                onNext={() => handleStatus(nowPlaying.id, "played")}
              />
            ) : (
              <View style={styles.emptyNow}>
                <Text style={styles.emptyNowTitle}>재생 중인 곡이 없어요.</Text>
              </View>
            )}

            <View style={styles.queueSection}>
              <View style={styles.queueHeader}>
                <Text style={styles.sectionTitle}>대기열</Text>
                <Text style={styles.queueCount}>
                  대기 {pendingCount} · 승인 {approvedCount}
                </Text>
              </View>
              <AppButton
                variant="quiet"
                style={styles.requestButton}
                onPress={() => setQueueSheetOpen(true)}
              >
                ＋ 곡 신청
              </AppButton>
              {upNext.length > 0 ? (
                <View style={styles.queueList}>
                  {upNext.map((item, index) => (
                    <DJQueueItem
                      key={item.id}
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
                  ))}
                </View>
              ) : (
                <Text style={styles.queueEmpty}>
                  신청곡이 없습니다. 첫 곡을 신청해 보세요.
                </Text>
              )}
            </View>
          </>
        ) : null}

        {activeSection === "history" ? (
          <View style={styles.historySection}>
            <View style={styles.historyHeader}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                이번 달 신청 TOP 5
              </Text>
              <SectionNav
                style={styles.historyKindNav}
                accessibilityLabel="신청 TOP 종류"
              >
                <SectionNavItem
                  selected={historyKind === "submitters"}
                  onPress={() => setHistoryKind("submitters")}
                  accessibilityLabel="신청자"
                >
                  신청자
                </SectionNavItem>
                <SectionNavItem
                  selected={historyKind === "songs"}
                  onPress={() => setHistoryKind("songs")}
                  accessibilityLabel="신청곡"
                >
                  신청곡
                </SectionNavItem>
              </SectionNav>
            </View>

            <View style={styles.historyMetric}>
              <Text style={styles.historyMetricLabel}>내 곡 재생 횟수</Text>
              <Text style={styles.historyMetricValue}>{myPlayedCount}회</Text>
            </View>

            {rankingLoading ? (
              <Text style={styles.historyEmpty}>
                이번 달 신청 TOP을 불러오는 중…
              </Text>
            ) : rankingError ? (
              <Text style={styles.historyEmpty}>{rankingError}</Text>
            ) : historyKind === "submitters" ? (
              <DJQueueRanking
                title=""
                items={topSubmitters}
                hidden={rankingData?.submittersHidden === true}
                countUnit="회"
                hiddenText="익명 보드에서는 신청자 순위를 숨겨요."
                emptyText="아직 신청자 기록이 없어요."
              />
            ) : (
              <DJQueueRanking
                title=""
                items={topSongs}
                countUnit="회"
                emptyText="아직 신청곡 기록이 없어요."
              />
            )}
          </View>
        ) : null}
      </ScrollView>

      <AppBottomSheet
        visible={queueSheetOpen}
        onClose={() => setQueueSheetOpen(false)}
        sheetStyle={styles.queueSheet}
        accessibilityLabel="곡 신청"
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
        {recentSubmissions.length > 0 ? (
          <View style={styles.recentSection}>
            <Text style={styles.recentTitle}>최근 신청곡</Text>
            <Text style={styles.recentDescription}>
              곡을 누르면 바로 다시 신청돼요.
            </Text>
            <View style={styles.recentList}>
              {recentSubmissions.map((card) => {
                const url = card.linkUrl ?? card.videoUrl;
                if (!url) return null;
                return (
                  <ControlPressable
                    key={card.id}
                    style={styles.recentRow}
                    onPress={() => void handleRecentSubmission(url)}
                    disabled={submitting}
                    accessibilityLabel={`${card.title} 다시 신청`}
                  >
                    <View style={styles.recentCopy}>
                      <Text style={styles.recentRowTitle} numberOfLines={1}>
                        {card.title}
                      </Text>
                      <Text style={styles.recentRowMeta} numberOfLines={1}>
                        {card.linkDesc || "최근 신청곡"}
                      </Text>
                    </View>
                    <Text style={styles.recentAction}>신청</Text>
                  </ControlPressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </AppBottomSheet>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  feed: { flex: 1 },
  feedContent: { paddingBottom: spacing.xxxl },
  sectionNav: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    marginTop: pageChrome.contentStartGap,
  },
  sectionNavItem: { flex: 1 },
  emptyNow: {
    marginHorizontal: pageChrome.horizontalPadding,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyNowTitle: { ...typography.subtitle, color: colors.textMuted },

  sectionTitle: { ...typography.section, color: colors.text },
  sheetHeader: {
    gap: spacing.xs,
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  sheetTitle: { ...typography.section, color: colors.text },
  sheetDescription: { ...typography.micro, color: colors.textMuted },
  submitInput: {
    backgroundColor: colors.surface,
    marginHorizontal: pageChrome.horizontalPadding,
  },
  submitBtn: {
    marginHorizontal: pageChrome.horizontalPadding,
    marginTop: spacing.md,
  },
  recentSection: {
    marginTop: spacing.xxl,
    paddingHorizontal: pageChrome.horizontalPadding,
  },
  recentTitle: { ...typography.section, color: colors.text },
  recentDescription: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  recentList: { gap: spacing.sm, marginTop: spacing.md },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  recentCopy: { flex: 1, minWidth: 0 },
  recentRowTitle: { ...typography.label, color: colors.text },
  recentRowMeta: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
  recentAction: { ...typography.badge, color: colors.accentTintedText },
  queueSection: {
    marginHorizontal: pageChrome.horizontalPadding,
    marginTop: spacing.xxl,
  },
  queueHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  queueCount: { ...typography.micro, color: colors.textMuted },
  requestButton: {
    alignSelf: "flex-start",
    minHeight: tapMin,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  queueList: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  queueEmpty: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  historySection: {
    marginHorizontal: pageChrome.horizontalPadding,
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  historyHeader: {
    minHeight: tapMin + spacing.xs,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  historyKindNav: {
    flexShrink: 0,
    borderBottomWidth: borders.none,
  },
  historyMetric: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  historyMetricLabel: { ...typography.body, color: colors.textMuted },
  historyMetricValue: { ...typography.section, color: colors.accentTintedText },
  historyEmpty: {
    ...typography.body,
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
    paddingBottom: spacing.md,
  },
});
