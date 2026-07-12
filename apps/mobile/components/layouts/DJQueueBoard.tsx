import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
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
  iconSizes,
  media,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import {
  BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS,
  shouldUseBoardFallbackPolling,
  useBoardRealtime,
} from "../../lib/use-board-realtime";
import { buildMediaItems } from "../../lib/media";
import type { BoardDetailResponse, BoardCard } from "../../lib/types";
import { withBoardAnonymousAuthor, withBoardAnonymousAuthors } from "../../lib/card-privacy";
import { DJRecapModal } from "../DJRecapModal";
import { EmbeddedMedia } from "../EmbeddedMedia";
import { AppButton, AppModal, IconButton, Pill, SurfaceCard, TextField } from "../ui";

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
  const [playedOpen, setPlayedOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const pendingIds = useRef<Set<string>>(new Set());
  const boardId = data.board.id;
  const { width } = useWindowDimensions();
  const compact = width < dj.compactBreakpoint;
  const canControl = data.capabilities?.canControlQueue === true;
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
        setCards((prev) => {
          const prevById = new Map(prev.map((c) => [c.id, c] as const));
          const next: BoardCard[] = [];
          for (const rawCard of res.cards) {
            const sc = withBoardAnonymousAuthor(rawCard, res.board);
            if (pendingIds.current.has(sc.id)) {
              const l = prevById.get(sc.id);
              next.push(l ?? sc);
            } else {
              next.push(sc);
            }
          }
          for (const l of prev) {
            if (
              pendingIds.current.has(l.id) &&
              !res.cards.some((sc) => sc.id === l.id)
            ) {
              next.push(l);
            }
          }
          return next;
        });
      } catch {
        // swallow — next tick.
      }
    }, BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [data.board.slug, realtimeStatus]);

  const activeQueue = useMemo(
    () =>
      [...cards]
        // rejected 항목은 교사/DJ 만 본다. 일반 학생은 안 보이게.
        .filter((c) => {
          if (!c.queueStatus || c.queueStatus === "played") return false;
          if (c.queueStatus === "rejected" && !canControl) return false;
          return true;
        })
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    // 일반 학생에게 rejected 항목이 보이지 않도록 canControl 일 때만 통과.
    [cards, canControl],
  );
  const playedCards = useMemo(
    () =>
      [...cards]
        .filter((c) => c.queueStatus === "played")
        .sort((a, b) => (b.order ?? 0) - (a.order ?? 0)),
    [cards],
  );
  const nowPlaying = useMemo(
    () => activeQueue.find((c) => c.queueStatus === "approved") ?? null,
    [activeQueue],
  );
  const upNext = activeQueue.filter((c) => c.id !== nowPlaying?.id);

  const pendingCount = activeQueue.filter((c) => c.queueStatus === "pending").length;
  const approvedCount = activeQueue.filter((c) => c.queueStatus === "approved").length;

  const ranking = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cards) {
      const name = resolveQueueAuthorName(c);
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, dj.rankingLimit);
  }, [cards]);

  async function trackMutation<T>(id: string, run: () => Promise<T>): Promise<T> {
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
      onMutate();
    } catch (e) {
      if (e instanceof ApiError) {
        const body = e.body as { error?: string } | string;
        setSubmitError(typeof body === "object" && body?.error ? body.error : `제출 실패 (${e.status})`);
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
        await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/queue/${cardId}`, {
          method: "PATCH",
          json: { status },
        });
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
              await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/queue/${cardId}`, {
                method: "DELETE",
              });
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
          apiFetch(`/api/boards/${encodeURIComponent(boardId)}/queue/${cardId}`, {
            method: "PATCH",
            json: { status: "approved" },
          }),
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
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>🎧 {data.board.title}</Text>
          <Text style={styles.subtitle}>
            DJ 큐 · 대기 {pendingCount} · 승인 {approvedCount} · 재생 완료 {playedCards.length}
          </Text>
        </View>
        <View style={[styles.headerActions, compact && styles.headerActionsCompact]}>
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
        <NowPlayingCard
          card={nowPlaying}
          compact={compact}
          canControl={canControl}
          onNext={() => handleStatus(nowPlaying.id, "played")}
        />
      ) : null}

      <View style={[styles.layout, compact && styles.layoutCompact]}>
        <SurfaceCard style={styles.queueCard}>
          <View style={styles.queueTitleRow}>
            <Text style={styles.queueTitle}>대기열</Text>
            <Text style={styles.queueHint}>
              {canControl ? "↑↓ 로 순서 변경 · 재생 완료에서도 복귀" : "선생님이 승인하면 재생 목록에 올라갑니다"}
            </Text>
          </View>
          {upNext.length === 0 ? (
            <Text style={styles.empty}>
              {nowPlaying ? "다음 곡이 없습니다. 오른쪽에서 신청해 보세요." : "신청곡이 없습니다. 오른쪽에서 신청해 보세요."}
            </Text>
          ) : (
            <FlatList
              data={upNext}
              keyExtractor={(c) => c.id}
              scrollEnabled={false}
              renderItem={({ item, index }) => (
                <QueueItem
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
            />
          )}
        </SurfaceCard>

        <View style={[styles.side, compact && styles.sideCompact]}>
          <SurfaceCard style={styles.submitCard}>
            <Text style={styles.sideTitle}>신청곡 추가</Text>
            <TextField
              style={styles.submitInput}
              placeholder="YouTube 링크 또는 곡 제목"
              value={submitUrl}
              onChangeText={(t) => {
                setSubmitUrl(t);
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
            ) : (
              <Text style={styles.submitNote}>
                학생 신청은 대기 상태로 등록되고, 선생님 승인 후 재생 목록에 올라갑니다.
              </Text>
            )}
          </SurfaceCard>

          <SurfaceCard style={styles.rankingCard}>
            <Text style={styles.sideTitle}>신청 TOP</Text>
            {ranking.length === 0 ? (
              <Text style={styles.submitNote}>아직 신청 기록이 없어요.</Text>
            ) : (
              ranking.map((r, i) => (
                <View key={r.name} style={styles.rankingRow}>
                  <Text style={[styles.rankingPos, i < 3 && styles.rankingPosTop]}>
                    {i + 1}
                  </Text>
                  <View style={[styles.rankingAvatar, i === 0 && styles.rankingAvatarTop]}>
                    <Text style={[styles.rankingAvatarText, i === 0 && styles.rankingAvatarTextTop]}>
                      {r.name[0]}
                    </Text>
                  </View>
                  <Text style={styles.rankingName} numberOfLines={1}>{r.name}</Text>
                  <Text style={styles.rankingCount}>{r.count}곡</Text>
                </View>
              ))
            )}
          </SurfaceCard>
        </View>
      </View>

      <PlayedDrawer
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

function NowPlayingCard({
  card,
  compact,
  canControl,
  onNext,
}: {
  card: BoardCard;
  compact: boolean;
  canControl: boolean;
  onNext: () => void;
}) {
  const submitter = resolveQueueAuthorName(card);
  const mediaUrl = getNowPlayingMediaUrl(card);
  const hasImage = !!card.linkImage;
  return (
    <SurfaceCard style={styles.now}>
      <Text style={styles.nowLabel}>▶ NOW PLAYING</Text>
      <View style={[styles.nowBody, compact && styles.nowBodyCompact]}>
        {mediaUrl ? (
          <View style={[styles.nowPlayer, compact && styles.nowPlayerCompact]}>
            <EmbeddedMedia url={mediaUrl} title={card.title} aspectRatio={dj.mediaAspectRatio} />
          </View>
        ) : hasImage ? (
          <Image source={{ uri: card.linkImage! }} style={styles.nowThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.nowThumb, styles.nowThumbFallback]}>
            <Text style={styles.nowThumbEmoji}>♪</Text>
          </View>
        )}
        <View style={styles.nowInfo}>
          <Text style={styles.nowTitle} numberOfLines={2}>{card.title}</Text>
          <Text style={styles.nowMeta}>
            {card.linkDesc ? `${card.linkDesc} · ` : ""}
            {submitter ? `${submitter}님 신청` : ""}
          </Text>
          {canControl ? (
            <View style={styles.nowActions}>
              <AppButton
                variant="secondary"
                onPress={onNext}
              >
                ⏭ 다음 곡
              </AppButton>
            </View>
          ) : null}
        </View>
      </View>
    </SurfaceCard>
  );
}

function getNowPlayingMediaUrl(card: BoardCard): string | null {
  const mediaItem = buildMediaItems(card).find(
    (item) => item.kind === "video" || item.kind === "link",
  );
  return mediaItem?.url ?? card.videoUrl ?? card.linkUrl ?? null;
}

function resolveQueueAuthorName(card: BoardCard): string {
  const resolved = card.externalAuthorName ?? card.studentAuthorName ?? card.authorName ?? "";
  return card.anonymousAuthor && resolved ? "익명" : resolved;
}

function QueueItem({
  card,
  rank,
  onApprove,
  onReject,
  onMarkPlayed,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  canControl,
}: {
  card: BoardCard;
  rank: number;
  onApprove: () => void;
  onReject: () => void;
  onMarkPlayed: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canControl: boolean;
}) {
  const submitter = resolveQueueAuthorName(card);
  const status = card.queueStatus ?? "pending";
  const isPending = status === "pending";

  return (
    <View style={[styles.queueItem, isPending && styles.queueItemPending]}>
      <Text style={styles.queueRank}>{rank}</Text>
      {card.linkImage ? (
        <Image source={{ uri: card.linkImage }} style={styles.queueThumb} resizeMode="cover" />
      ) : (
        <View style={[styles.queueThumb, styles.queueThumbFallback]}>
          <Text style={styles.queueThumbEmoji}>♪</Text>
        </View>
      )}
      <View style={styles.queueInfo}>
        <Text style={styles.queueTrack} numberOfLines={1}>{card.title}</Text>
        <View style={styles.queueSubRow}>
          {card.linkDesc ? (
            <Text style={styles.queueSub}>{card.linkDesc}</Text>
          ) : null}
          {submitter ? (
            <Text style={styles.queueSub}>
              {card.linkDesc ? " · " : ""}{submitter}
            </Text>
          ) : null}
          {isPending ? (
            <Pill tone="warning" style={styles.pendingPill} textStyle={styles.pendingText}>
              대기
            </Pill>
          ) : null}
        </View>
      </View>
      {canControl ? (
        <View style={styles.queueCtrls}>
          <IconButton
            style={styles.iconBtn}
            onPress={onMoveUp}
            disabled={!canMoveUp}
          >
            <Text style={styles.iconBtnText}>↑</Text>
          </IconButton>
          <IconButton
            style={styles.iconBtn}
            onPress={onMoveDown}
            disabled={!canMoveDown}
          >
            <Text style={styles.iconBtnText}>↓</Text>
          </IconButton>
          {isPending ? (
            <AppButton
              variant="secondary"
              style={[styles.ctrlBtn, styles.ctrlApprove]}
              textStyle={styles.ctrlText}
              onPress={onApprove}
            >
              승인
            </AppButton>
          ) : null}
          <AppButton
            variant="quiet"
            style={styles.ctrlBtn}
            textStyle={styles.ctrlText}
            onPress={onMarkPlayed}
          >
            ✓
          </AppButton>
          <AppButton
            variant="quiet"
            style={styles.ctrlBtn}
            textStyle={styles.ctrlText}
            onPress={isPending ? onReject : onDelete}
          >
            {isPending ? "거부" : "제거"}
          </AppButton>
        </View>
      ) : isPending && card.isOwnPendingQueue ? (
        // 일반 학생도 본인 pending 신청은 취소할 수 있다.
        <View style={styles.queueCtrls}>
          <AppButton
            variant="quiet"
            style={styles.ctrlBtn}
            textStyle={styles.ctrlText}
            onPress={onDelete}
          >
            신청 취소
          </AppButton>
        </View>
      ) : null}
    </View>
  );
}

function PlayedDrawer({
  open,
  played,
  canControl,
  onClose,
  onRestore,
  onDelete,
}: {
  open: boolean;
  played: BoardCard[];
  canControl: boolean;
  onClose: () => void;
  onRestore: (cardId: string) => void;
  onDelete: (cardId: string) => void;
}) {
  return (
    <AppModal
      visible={open}
      animationType="slide"
      onClose={onClose}
      align="right"
      closeOnBackdropPress
      sheetStyle={styles.drawer}
      accessibilityLabel="재생 완료 목록"
    >
      <View style={styles.drawerHead}>
        <View style={styles.drawerCopy}>
          <Text style={styles.drawerTitle}>재생 완료</Text>
          <Text style={styles.drawerSubtitle}>대기열로 복귀시킬 수 있습니다</Text>
        </View>
        <IconButton style={styles.drawerClose} onPress={onClose}>
          <Text style={styles.drawerCloseText}>×</Text>
        </IconButton>
      </View>
      <ScrollView contentContainerStyle={styles.drawerList}>
        {played.length === 0 ? (
          <Text style={styles.empty}>재생 완료된 곡이 없습니다.</Text>
        ) : (
          played.map((p) => (
            <View key={p.id} style={styles.drawerItem}>
              {p.linkImage ? (
                <Image source={{ uri: p.linkImage }} style={styles.drawerThumb} resizeMode="cover" />
              ) : (
                <View style={[styles.drawerThumb, styles.drawerThumbFallback]}>
                  <Text style={styles.drawerThumbEmoji}>♪</Text>
                </View>
              )}
              <View style={styles.drawerInfo}>
                <Text style={styles.drawerItemTitle} numberOfLines={1}>{p.title}</Text>
                <Text style={styles.drawerItemSub} numberOfLines={1}>
                  {p.linkDesc ? `${p.linkDesc} · ` : ""}
                  {resolveQueueAuthorName(p)}
                </Text>
              </View>
              {canControl ? (
                <>
                  <IconButton
                    style={styles.drawerBtn}
                    onPress={() => onRestore(p.id)}
                  >
                    <Text style={styles.drawerBtnText}>↺</Text>
                  </IconButton>
                  <IconButton
                    style={styles.drawerBtn}
                    onPress={() => onDelete(p.id)}
                  >
                    <Text style={styles.drawerBtnDangerText}>×</Text>
                  </IconButton>
                </>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
      <View style={styles.drawerFoot}>
        <Text style={styles.drawerFootText}>총 {played.length}곡 재생됨</Text>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: spacing.xl, gap: spacing.lg },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
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
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs },
  headerBtn: {
    flexShrink: 0,
  },

  // NOW PLAYING
  now: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  nowLabel: { ...typography.badge, color: colors.accent },
  nowBody: {
    flexDirection: "row",
    gap: spacing.lg,
    alignItems: "center",
  },
  nowBodyCompact: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  nowPlayer: {
    width: dj.nowPlayerWidth,
    maxWidth: dj.nowPlayerMaxWidth,
    borderRadius: radii.control,
    overflow: "hidden",
  },
  nowPlayerCompact: {
    width: dj.nowPlayerCompactWidth,
    maxWidth: dj.nowPlayerCompactMaxWidth,
  },
  nowThumb: {
    width: dj.nowThumbWidth,
    height: dj.nowThumbHeight,
    borderRadius: radii.control,
    backgroundColor: colors.mediaLilacDark,
  },
  nowThumbFallback: { alignItems: "center", justifyContent: "center" },
  nowThumbEmoji: { fontSize: iconSizes.xl, color: colors.onAccent },
  nowInfo: { flex: 1, minWidth: 0 },
  nowTitle: { ...typography.title, color: colors.text, marginBottom: spacing.xs },
  nowMeta: { ...typography.body, color: colors.textMuted },
  nowActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  // Layout
  layout: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.lg,
  },
  layoutCompact: {
    flexDirection: "column",
  },
  queueCard: {
    flex: 1,
    padding: spacing.md,
  },
  queueTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  queueTitle: { ...typography.section, color: colors.text },
  queueHint: { ...typography.micro, color: colors.textMuted },
  separator: { height: spacing.xs },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    padding: spacing.xl,
  },

  // Queue item
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.btn,
    backgroundColor: colors.transparent,
  },
  queueItemPending: { backgroundColor: colors.warningTintedBg },
  queueRank: {
    width: dj.queueRankWidth,
    textAlign: "center",
    ...typography.label,
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  queueThumb: {
    width: dj.queueThumbWidth,
    aspectRatio: media.previewAspectRatio,
    borderRadius: radii.btn,
    backgroundColor: colors.mediaLilac,
  },
  queueThumbFallback: { alignItems: "center", justifyContent: "center" },
  queueThumbEmoji: { fontSize: iconSizes.sm, color: colors.onAccent },
  queueInfo: { flex: 1, minWidth: 0 },
  queueTrack: { ...typography.label, color: colors.text },
  queueSubRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  queueSub: { ...typography.micro, color: colors.textMuted },
  pendingPill: {
    marginLeft: spacing.xs,
  },
  pendingText: { ...typography.badge, color: colors.warningTintedText },
  queueCtrls: { flexDirection: "row", gap: spacing.xs },
  iconBtn: {
    width: dj.compactIconButton,
    height: dj.compactIconButton,
    backgroundColor: colors.transparent,
  },
  iconBtnText: { ...typography.label, color: colors.textMuted },
  ctrlBtn: {
    minHeight: dj.compactIconButton,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  ctrlApprove: { borderColor: colors.plantActive, backgroundColor: colors.statusReviewedBg },
  ctrlText: { ...typography.badge, color: colors.textMuted },

  // Side
  side: { width: dj.sideWidth, gap: spacing.md },
  sideCompact: { width: "100%" },
  submitCard: {
    padding: spacing.lg,
  },
  sideTitle: { ...typography.label, color: colors.text, marginBottom: spacing.md },
  submitInput: {
    backgroundColor: colors.bg,
  },
  submitBtn: {
    marginTop: spacing.sm,
  },
  submitNote: { ...typography.micro, color: colors.textMuted, marginTop: spacing.sm },
  submitError: { ...typography.micro, color: colors.danger, marginTop: spacing.sm },

  rankingCard: {
    padding: spacing.lg,
  },
  rankingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rankingPos: {
    width: dj.rankingPositionWidth,
    textAlign: "center",
    ...typography.label,
    fontFamily: "monospace",
    color: colors.textMuted,
  },
  rankingPosTop: { color: colors.rankingGold },
  rankingAvatar: {
    width: dj.rankingAvatarSize,
    height: dj.rankingAvatarSize,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  rankingAvatarTop: { backgroundColor: colors.rankingGold },
  rankingAvatarText: { ...typography.micro, color: colors.text },
  rankingAvatarTextTop: { color: colors.onAccent },
  rankingName: { flex: 1, ...typography.body, color: colors.text },
  rankingCount: { ...typography.body, color: colors.textMuted, fontVariant: ["tabular-nums"] },

  // Drawer
  drawer: {
    width: dj.drawerWidth,
    height: "100%",
    maxHeight: "100%",
    borderRadius: radii.none,
  },
  drawerHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  drawerCopy: { flex: 1 },
  drawerTitle: { ...typography.section, color: colors.text },
  drawerSubtitle: { ...typography.micro, color: colors.textMuted, marginTop: spacing.xs },
  drawerClose: {
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
  drawerCloseText: { ...typography.subtitle, color: colors.textMuted },
  drawerList: { padding: spacing.sm, gap: spacing.xs },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.btn,
  },
  drawerThumb: {
    width: dj.drawerThumbWidth,
    aspectRatio: media.previewAspectRatio,
    borderRadius: radii.btn,
    backgroundColor: colors.mediaNeutral,
  },
  drawerThumbFallback: { alignItems: "center", justifyContent: "center" },
  drawerThumbEmoji: { fontSize: iconSizes.sm, color: colors.onAccent },
  drawerInfo: { flex: 1, minWidth: 0 },
  drawerItemTitle: { ...typography.label, color: colors.text },
  drawerItemSub: { ...typography.micro, color: colors.textMuted, marginTop: spacing.xs },
  drawerBtn: {
    borderRadius: radii.btn,
  },
  drawerBtnText: { ...typography.label, color: colors.textMuted },
  drawerBtnDangerText: { ...typography.label, color: colors.danger },
  drawerFoot: {
    padding: spacing.md,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
    alignItems: "center",
  },
  drawerFootText: { ...typography.micro, color: colors.textMuted },
});
