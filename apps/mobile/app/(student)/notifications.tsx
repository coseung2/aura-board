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
import { clearSessionToken } from "../../lib/session";
import type {
  StudentNotificationItem,
  StudentNotificationPayload,
} from "../../lib/types";
import { studentNotificationTarget } from "../../lib/student-notifications";
import { colors, spacing, states, studentNav, typography } from "../../theme/tokens";
import {
  AppButton,
  AppHeader,
  EmptyState,
  Pill,
  SurfacePressable,
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
        router.replace("/(student)/login");
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
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>좋아요와 댓글</Text>
              <Text style={styles.subtitle}>내 게시물에 새로 생긴 반응이에요.</Text>
            </View>
            {payload?.count ? (
              <AppButton variant="quiet" loading={markingAll} onPress={() => void markAllRead()}>
                전체 읽음
              </AppButton>
            ) : null}
          </View>
          {!payload?.items.length ? (
            <EmptyState title="새 알림이 없어요." />
          ) : payload.items.map((item) => (
            <SurfacePressable
              key={item.id}
              style={[styles.item, item.read && styles.itemRead]}
              onPress={() => void markRead(item)}
            >
              <View style={styles.itemTop}>
                <Pill tone={item.kind === "like" ? "accent" : "neutral"}>
                  {item.kind === "like" ? "좋아요" : "댓글"}
                </Pill>
                {!item.read ? <View style={styles.unreadDot} /> : null}
              </View>
              <Text style={styles.itemTitle}>
                {item.actorLabel}님이 {item.kind === "like" ? "좋아요를 눌렀어요." : "댓글을 남겼어요."}
              </Text>
              {item.content ? <Text style={styles.contentText}>{item.content}</Text> : null}
              <Text style={styles.meta}>{item.cardTitle || "제목 없는 카드"} · {item.boardTitle}</Text>
            </SurfacePressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  content: { padding: spacing.xl, gap: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
  item: { gap: spacing.sm, padding: spacing.lg },
  itemRead: { opacity: states.pressedOpacity },
  itemTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  unreadDot: {
    width: studentNav.notificationUnreadDotSize,
    height: studentNav.notificationUnreadDotSize,
    borderRadius: studentNav.notificationUnreadDotSize / 2,
    backgroundColor: colors.accent,
  },
  itemTitle: { ...typography.section, color: colors.text },
  contentText: { ...typography.body, color: colors.text },
  meta: { ...typography.micro, color: colors.textMuted },
});
