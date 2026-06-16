import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, radii, shadows, spacing, tapMin, typography } from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { buildMediaItems } from "../../lib/media";
import type { BoardDetailResponse, BoardCard } from "../../lib/types";
import { DJRecapModal } from "../DJRecapModal";
import { EmbeddedMedia } from "../EmbeddedMedia";

// DJ 큐 보드 — 웹 디자인 핸드오프 DJBoardPage.jsx 를 네이티브로 이식.
//   [헤더: 제목 + 카운트 + 재생완료 토글]
//   [NOW PLAYING 카드 (전체 폭)]
//   [2열] 대기열 카드 | 사이드 (신청폼 + 랭킹)
//   + 재생완료 드로어 = 네이티브 Modal (슬라이드 왼쪽)
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
  const [cards, setCards] = useState<BoardCard[]>(data.cards);
  const [submitUrl, setSubmitUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [playedOpen, setPlayedOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const pendingIds = useRef<Set<string>>(new Set());
  const boardId = data.board.id;

  // 2초 폴링으로 교사의 승인/재생 완료 반영.
  useEffect(() => {
    const handle = setInterval(async () => {
      try {
        const res = await apiFetch<BoardDetailResponse>(
          `/api/student/board/${encodeURIComponent(data.board.slug)}`,
        );
        setCards((prev) => {
          const prevById = new Map(prev.map((c) => [c.id, c] as const));
          const next: BoardCard[] = [];
          for (const sc of res.cards) {
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
    }, 2000);
    return () => clearInterval(handle);
  }, [data.board.slug]);

  const activeQueue = useMemo(
    () =>
      [...cards]
        .filter((c) => c.queueStatus && c.queueStatus !== "played")
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [cards],
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
      const name = c.externalAuthorName ?? c.studentAuthorName ?? c.authorName;
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
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
      setCards((prev) => [...prev, card]);
      setSubmitUrl("");
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
      } catch {
        setCards(prev);
      }
    });
  }

  async function handleDelete(cardId: string) {
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
            } catch {
              setCards(prev);
            }
          });
        },
      },
    ]);
  }

  async function handleMove(cardId: string, direction: -1 | 1) {
    const idx = activeQueue.findIndex((c) => c.id === cardId);
    if (idx < 0) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= activeQueue.length) return;
    const self = activeQueue[idx];
    const other = activeQueue[swapIdx];
    if (!self || !other) return;
    const targetOrder = other.order ?? 0;
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
      } catch {
        setCards(prev);
      }
    });
  }

  async function handleRestore(cardId: string) {
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
      } catch {
        setCards(prev);
      }
    });
  }

  // 교사인지 학생인지 구분 — mobile은 학생 전용이라 항상 학생. 승인/거부/재생은
  // 서버에서 ClassroomRoleAssignment(DJ 역할) 기준으로 판단하므로 UI는 시도만
  // 노출하고 서버가 403 을 반환하면 그 때 경고. 단순성을 위해 모든 컨트롤 노출.
  const canControl = true;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🎧 {data.board.title}</Text>
          <Text style={styles.subtitle}>
            DJ 큐 · 대기 {pendingCount} · 승인 {approvedCount} · 재생 완료 {playedCards.length}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
            onPress={() => setRecapOpen(true)}
          >
            <Text style={styles.headerBtnText}>📊 이달의 리캡</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
            onPress={() => setPlayedOpen(true)}
          >
            <Text style={styles.headerBtnText}>🕘 재생 완료 ({playedCards.length})</Text>
          </Pressable>
        </View>
      </View>

      {nowPlaying ? <NowPlayingCard card={nowPlaying} onNext={() => handleStatus(nowPlaying.id, "played")} /> : null}

      <View style={styles.layout}>
        <View style={styles.queueCard}>
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
                />
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}
        </View>

        <View style={styles.side}>
          <View style={styles.submitCard}>
            <Text style={styles.sideTitle}>신청곡 추가</Text>
            <TextInput
              style={styles.submitInput}
              placeholder="YouTube 링크 또는 곡 제목"
              placeholderTextColor={colors.textFaint}
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
            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                (!submitUrl.trim() || submitting) && styles.submitBtnDisabled,
                pressed && !!submitUrl.trim() && !submitting && styles.submitBtnPressed,
              ]}
              onPress={handleSubmit}
              disabled={!submitUrl.trim() || submitting}
            >
              <Text style={styles.submitBtnText}>{submitting ? "신청 중…" : "신청하기"}</Text>
            </Pressable>
            {submitError ? (
              <Text style={styles.submitError}>{submitError}</Text>
            ) : (
              <Text style={styles.submitNote}>
                학생 신청은 대기 상태로 등록되고, 선생님 승인 후 재생 목록에 올라갑니다.
              </Text>
            )}
          </View>

          <View style={styles.rankingCard}>
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
                    <Text style={[styles.rankingAvatarText, i === 0 && { color: "#fff" }]}>
                      {r.name[0]}
                    </Text>
                  </View>
                  <Text style={styles.rankingName} numberOfLines={1}>{r.name}</Text>
                  <Text style={styles.rankingCount}>{r.count}곡</Text>
                </View>
              ))
            )}
          </View>
        </View>
      </View>

      <PlayedDrawer
        open={playedOpen}
        played={playedCards}
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
  onNext,
}: {
  card: BoardCard;
  onNext: () => void;
}) {
  const submitter =
    card.externalAuthorName ?? card.studentAuthorName ?? card.authorName ?? "";
  const mediaUrl = getNowPlayingMediaUrl(card);
  const hasImage = !!card.linkImage;
  return (
    <View style={styles.now}>
      <Text style={styles.nowLabel}>▶ NOW PLAYING</Text>
      <View style={styles.nowBody}>
        {mediaUrl ? (
          <View style={styles.nowPlayer}>
            <EmbeddedMedia url={mediaUrl} title={card.title} aspectRatio={16 / 9} />
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
          <View style={styles.nowActions}>
            <Pressable
              style={({ pressed }) => [styles.nextBtn, pressed && styles.nextBtnPressed]}
              onPress={onNext}
            >
              <Text style={styles.nextBtnText}>⏭ 다음 곡</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function getNowPlayingMediaUrl(card: BoardCard): string | null {
  const mediaItem = buildMediaItems(card).find(
    (item) => item.kind === "video" || item.kind === "link",
  );
  return mediaItem?.url ?? card.videoUrl ?? card.linkUrl ?? null;
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
}) {
  const submitter =
    card.externalAuthorName ?? card.studentAuthorName ?? card.authorName ?? "";
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
            <View style={styles.pendingPill}>
              <View style={styles.pendingDot} />
              <Text style={styles.pendingText}>대기</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.queueCtrls}>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, (!canMoveUp || pressed) && styles.iconBtnDim]}
          onPress={onMoveUp}
          disabled={!canMoveUp}
        >
          <Text style={styles.iconBtnText}>↑</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, (!canMoveDown || pressed) && styles.iconBtnDim]}
          onPress={onMoveDown}
          disabled={!canMoveDown}
        >
          <Text style={styles.iconBtnText}>↓</Text>
        </Pressable>
        {isPending ? (
          <Pressable
            style={({ pressed }) => [styles.ctrlBtn, styles.ctrlApprove, pressed && styles.ctrlPressed]}
            onPress={onApprove}
          >
            <Text style={styles.ctrlText}>승인</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.ctrlBtn, pressed && styles.ctrlPressed]}
          onPress={onMarkPlayed}
        >
          <Text style={styles.ctrlText}>✓</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.ctrlBtn, styles.ctrlReject, pressed && styles.ctrlPressed]}
          onPress={isPending ? onReject : onDelete}
        >
          <Text style={styles.ctrlText}>{isPending ? "거부" : "제거"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PlayedDrawer({
  open,
  played,
  onClose,
  onRestore,
  onDelete,
}: {
  open: boolean;
  played: BoardCard[];
  onClose: () => void;
  onRestore: (cardId: string) => void;
  onDelete: (cardId: string) => void;
}) {
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.drawerBackdrop} onPress={onClose}>
        <Pressable style={styles.drawer} onPress={() => undefined}>
          <View style={styles.drawerHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.drawerTitle}>재생 완료</Text>
              <Text style={styles.drawerSubtitle}>대기열로 복귀시킬 수 있습니다</Text>
            </View>
            <Pressable style={styles.drawerClose} onPress={onClose}>
              <Text style={styles.drawerCloseText}>×</Text>
            </Pressable>
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
                      {p.externalAuthorName ?? p.studentAuthorName ?? p.authorName ?? ""}
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.drawerBtn, pressed && styles.ctrlPressed]}
                    onPress={() => onRestore(p.id)}
                  >
                    <Text style={styles.drawerBtnText}>↺</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.drawerBtn, styles.drawerBtnDanger, pressed && styles.ctrlPressed]}
                    onPress={() => onDelete(p.id)}
                  >
                    <Text style={[styles.drawerBtnText, { color: colors.danger }]}>×</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
          <View style={styles.drawerFoot}>
            <Text style={styles.drawerFootText}>총 {played.length}곡 재생됨</Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: 2 },
  headerBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.btn,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerBtnPressed: { backgroundColor: colors.surfaceAlt },
  headerBtnText: { ...typography.label, color: colors.text },

  // NOW PLAYING
  now: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
    padding: spacing.xl,
    gap: spacing.md,
  },
  nowLabel: { ...typography.badge, color: colors.accent },
  nowBody: {
    flexDirection: "row",
    gap: spacing.lg,
    alignItems: "center",
  },
  nowPlayer: {
    width: 320,
    maxWidth: "52%",
    borderRadius: 8,
    overflow: "hidden",
  },
  nowThumb: {
    width: 240,
    height: 135,
    borderRadius: 8,
    backgroundColor: "#b79bff",
  },
  nowThumbFallback: { alignItems: "center", justifyContent: "center" },
  nowThumbEmoji: { fontSize: 40, color: "#fff" },
  nowInfo: { flex: 1, minWidth: 0 },
  nowTitle: { ...typography.title, color: colors.text, marginBottom: spacing.xs },
  nowMeta: { ...typography.body, color: colors.textMuted },
  nowActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  playBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
    minHeight: tapMin,
    justifyContent: "center",
    ...shadows.accent,
  },
  playBtnPressed: { backgroundColor: colors.accentActive },
  playBtnText: { color: "#fff", ...typography.label, fontWeight: "600" },
  nextBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "transparent",
    minHeight: tapMin,
    justifyContent: "center",
  },
  nextBtnPressed: { backgroundColor: colors.surfaceAlt },
  nextBtnText: { ...typography.label, color: colors.text },

  // Layout
  layout: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.lg,
  },
  queueCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
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
  separator: { height: 4 },
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
    gap: spacing.md,
    padding: spacing.sm + 2,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  queueItemPending: { backgroundColor: "rgba(245, 158, 11, 0.06)" },
  queueRank: {
    width: 24,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  queueThumb: {
    width: 56,
    height: 42,
    borderRadius: 4,
    backgroundColor: "#c7b8ff",
  },
  queueThumbFallback: { alignItems: "center", justifyContent: "center" },
  queueThumbEmoji: { fontSize: 16, color: "#fff" },
  queueInfo: { flex: 1, minWidth: 0 },
  queueTrack: { ...typography.label, color: colors.text, fontSize: 14, fontWeight: "600" },
  queueSubRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 2, marginTop: 2 },
  queueSub: { ...typography.micro, color: colors.textMuted },
  pendingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: radii.pill,
    backgroundColor: "#fef3c7",
  },
  pendingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#92610a" },
  pendingText: { fontSize: 11, fontWeight: "600", color: "#92610a" },
  queueCtrls: { flexDirection: "row", gap: 2 },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  iconBtnDim: { opacity: 0.3 },
  iconBtnText: { fontSize: 14, color: colors.textMuted, fontWeight: "700" },
  ctrlBtn: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "transparent",
  },
  ctrlPressed: { opacity: 0.6 },
  ctrlApprove: { borderColor: "rgba(39,163,95,0.3)", backgroundColor: "rgba(39,163,95,0.08)" },
  ctrlReject: { },
  ctrlText: { fontSize: 12, fontWeight: "500", color: colors.textMuted },

  // Side
  side: { width: 300, gap: spacing.md },
  submitCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
    padding: spacing.lg,
  },
  sideTitle: { ...typography.label, fontSize: 14, color: colors.text, marginBottom: spacing.sm + 2 },
  submitInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: spacing.sm + 2,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  submitBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.accent,
    borderRadius: radii.btn,
    alignItems: "center",
    minHeight: tapMin,
    justifyContent: "center",
  },
  submitBtnPressed: { backgroundColor: colors.accentActive },
  submitBtnDisabled: { backgroundColor: colors.border },
  submitBtnText: { color: "#fff", ...typography.label, fontSize: 14, fontWeight: "600" },
  submitNote: { ...typography.micro, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 },
  submitError: { ...typography.micro, color: colors.danger, marginTop: spacing.sm },

  rankingCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
    padding: spacing.lg,
  },
  rankingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    paddingVertical: 6,
  },
  rankingPos: {
    width: 22,
    textAlign: "center",
    fontFamily: "monospace",
    fontWeight: "700",
    fontSize: 13,
    color: colors.textMuted,
  },
  rankingPosTop: { color: "#c9a227" },
  rankingAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  rankingAvatarTop: { backgroundColor: "#c9a227" },
  rankingAvatarText: { fontSize: 10, fontWeight: "600", color: colors.text },
  rankingName: { flex: 1, ...typography.body, fontSize: 13, color: colors.text },
  rankingCount: { ...typography.body, fontSize: 13, color: colors.textMuted, fontVariant: ["tabular-nums"] },

  // Drawer
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  drawer: {
    width: 360,
    height: "100%",
    backgroundColor: colors.surface,
    ...shadows.cardHover,
  },
  drawerHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  drawerTitle: { ...typography.section, color: colors.text, fontSize: 14, fontWeight: "700" },
  drawerSubtitle: { ...typography.micro, color: colors.textMuted, marginTop: 2 },
  drawerClose: {
    width: 32,
    height: 32,
    borderRadius: radii.btn,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerCloseText: { fontSize: 16, color: colors.textMuted },
  drawerList: { padding: spacing.sm, gap: 4 },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  drawerThumb: {
    width: 44,
    height: 34,
    borderRadius: 4,
    backgroundColor: "#b5b5b5",
  },
  drawerThumbFallback: { alignItems: "center", justifyContent: "center" },
  drawerThumbEmoji: { fontSize: 14, color: "#fff" },
  drawerInfo: { flex: 1, minWidth: 0 },
  drawerItemTitle: { ...typography.label, fontSize: 13, color: colors.text },
  drawerItemSub: { ...typography.micro, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  drawerBtn: {
    width: 32,
    height: 32,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerBtnDanger: { },
  drawerBtnText: { fontSize: 14, color: colors.textMuted },
  drawerFoot: {
    padding: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: "center",
  },
  drawerFootText: { ...typography.micro, color: colors.textMuted },
});
