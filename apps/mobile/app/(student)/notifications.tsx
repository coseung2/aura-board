import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken, getUnifiedLoginRoute } from "../../lib/session";
import type {
  StudentNotificationItem,
  StudentNotificationPayload,
} from "../../lib/types";
import { studentNotificationTarget } from "../../lib/student-notifications";
import {
  borders,
  colors,
  layout,
  pageChrome,
  radii,
  spacing,
  studentNav,
  tapMin,
  typography,
} from "../../theme/tokens";
import {
  AppButton,
  AppHeader,
  ControlPressable,
  SectionHeader,
} from "../../components/ui";

export default function StudentNotificationsScreen() {
  const router = useRouter();
  const [payload, setPayload] = useState<StudentNotificationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      setError(null);
      setPayload(await apiFetch<StudentNotificationPayload>("/api/student/notifications"));
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.status === 401) {
        await clearSessionToken();
        router.replace(getUnifiedLoginRoute("student"));
        return;
      }
      setError("알림을 불러오지 못했어요.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(item: StudentNotificationItem) {
    if (!item.read) {
      const sourceId = item.id.slice(`${item.kind}:`.length);
      setPayload((current) => current ? {
        count: Math.max(0, current.count - 1),
        items: current.items.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry),
      } : current);
      await apiFetch("/api/student/notifications", {
        method: "POST",
        json: { action: "mark_read", kind: item.kind, id: sourceId },
      }).catch(() => undefined);
    }
    router.push(studentNotificationTarget(item.href) as Href);
  }

  async function markAllRead() {
    if (markingAll || !payload?.count) return;
    setMarkingAll(true);
    try {
      await apiFetch("/api/student/notifications", {
        method: "POST",
        json: { action: "mark_all_read" },
      });
      setPayload((current) => current ? {
        count: 0,
        items: current.items.map((item) => ({ ...item, read: true })),
      } : current);
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="알림" onBack={() => router.back()} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <AppButton onPress={() => void load()}>다시 시도</AppButton>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          <SectionHeader
            title="알림"
            right={
              payload?.count ? (
                <AppButton
                  variant="quiet"
                  loading={markingAll}
                  onPress={() => void markAllRead()}
                >
                  전체 읽음
                </AppButton>
              ) : undefined
            }
          />
          <Text style={styles.subtitle}>좋아요, 댓글과 보상 소식이에요.</Text>
          {!payload?.items.length ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>새 알림이 없어요.</Text>
              <Text style={styles.emptyDescription}>
                내 게시물에 반응이 생기면 이곳에서 확인할 수 있어요.
              </Text>
            </View>
          ) : (
            <View style={styles.itemList}>
              {payload.items.map((item, index) => (
                <ControlPressable
                  key={item.id}
                  style={[
                    styles.item,
                    item.read && styles.itemRead,
                    index < payload.items.length - 1 && styles.itemDivider,
                  ]}
                  onPress={() => void markRead(item)}
                  accessibilityLabel={
                    item.kind === "reward"
                      ? `${item.cardTitle || "보상"} 알림 열기`
                      : `${item.actorLabel} ${item.kind === "like" ? "좋아요" : "댓글"} 알림 열기`
                  }
                >
                  <View style={styles.itemTop}>
                    <Text
                      style={[
                        styles.kind,
                        item.kind === "like"
                          ? styles.kindLike
                          : item.kind === "comment"
                            ? styles.kindComment
                            : styles.kindReward,
                      ]}
                    >
                      {item.kind === "like"
                        ? "좋아요"
                        : item.kind === "comment"
                          ? "댓글"
                          : "보상"}
                    </Text>
                    <View style={styles.itemTimeRow}>
                      <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
                      {!item.read ? <View style={styles.unreadDot} /> : null}
                    </View>
                  </View>
                  <Text style={[styles.itemTitle, !item.read && styles.itemTitleUnread]}>
                    {item.kind === "reward"
                      ? `${item.cardTitle || "보상"}을 받았어요.`
                      : `${item.actorLabel}님이 ${item.kind === "like" ? "좋아요를 눌렀어요." : "댓글을 남겼어요."}`}
                  </Text>
                  {item.content ? <Text style={styles.contentText}>{item.content}</Text> : null}
                  <Text style={styles.meta}>
                    {item.kind === "reward"
                      ? item.boardTitle || "내 통장"
                      : `${item.cardTitle || "제목 없는 카드"} · ${item.boardTitle}`}
                  </Text>
                </ControlPressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  content: {
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    alignSelf: "center",
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: pageChrome.directContentStartGap,
    paddingBottom: spacing.xxxl + spacing.xl,
    gap: spacing.md,
  },
  subtitle: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
  itemList: { gap: spacing.none },
  item: {
    minHeight: tapMin,
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xs,
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  itemRead: { backgroundColor: colors.transparent },
  itemDivider: {
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  itemTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  kind: { ...typography.badge },
  kindLike: { color: colors.accent },
  kindComment: { color: colors.textMuted },
  kindReward: { color: colors.bankPositive },
  itemTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  time: { ...typography.micro, color: colors.textMuted },
  unreadDot: {
    width: studentNav.notificationUnreadDotSize,
    height: studentNav.notificationUnreadDotSize,
    borderRadius: studentNav.notificationUnreadDotSize / 2,
    backgroundColor: colors.accent,
  },
  itemTitle: { ...typography.section, color: colors.text },
  itemTitleUnread: { color: colors.accentTintedText },
  contentText: { ...typography.body, color: colors.text },
  meta: { ...typography.micro, color: colors.textMuted },
  emptyState: {
    alignItems: "flex-start",
    gap: spacing.xs,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xs,
  },
  emptyTitle: { ...typography.subtitle, color: colors.text },
  emptyDescription: { ...typography.body, color: colors.textMuted },
});
