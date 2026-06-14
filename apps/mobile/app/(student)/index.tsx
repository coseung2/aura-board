import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from "../../theme/tokens";
import { layoutEmoji, layoutLabel } from "../../theme/layout-meta";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type { BoardMeta, MeResponse } from "../../lib/types";

// 학생 대시보드. /api/student/me 로 본인 + 학급의 보드 전체 로딩.
// Tab S6 Lite 가로(2000×1200) 기준 4-column grid.

export default function StudentHome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const columnCount = width < 560 ? 1 : width < 920 ? 2 : width < 1280 ? 3 : 4;

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const res = await apiFetch<MeResponse>("/api/student/me");
      setMe(res);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await clearSessionToken();
        router.replace("/(student)/login");
        return;
      }
      setError(e instanceof Error ? e.message : "불러올 수 없어요");
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  async function handleLogout() {
    await clearSessionToken();
    // Web-side POST /api/student/logout — best-effort. 실패해도 로컬 삭제가 우선.
    apiFetch("/api/student/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/(student)/login");
  }

  if (loading && !me) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>보드를 불러오는 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !me) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.errorCenter}>
          <Text style={styles.errorEmoji}>😵</Text>
          <Text style={styles.errorTitle}>연결할 수 없어요</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
            onPress={() => { setLoading(true); load(); }}
          >
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const boards = me?.boards ?? [];
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{me?.student.name}님, 안녕하세요!</Text>
          <Text style={styles.classroom}>
            {me?.student.classroom?.name ?? "학급 미배정"} · 오늘의 보드 {boards.length}개
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && styles.logoutBtnPressed]}
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>
      </View>

      <FlatList
        key={`boards-${columnCount}`}
        data={boards}
        keyExtractor={(b) => b.id}
        numColumns={columnCount}
        columnWrapperStyle={columnCount > 1 ? styles.gridRow : undefined}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => <BoardCard board={item} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>아직 보드가 없어요</Text>
            <Text style={styles.emptyMsg}>선생님이 새 보드를 만들면 여기에 나타나요.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function BoardCard({ board }: { board: BoardMeta }) {
  const router = useRouter();
  const quizRoom = board.quizzes?.[0];
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() =>
        router.push(`/(student)/board/${board.slug}?layout=${board.layout}`)
      }
    >
      <View style={styles.cardEmojiWrap}>
        <Text style={styles.cardEmoji}>{layoutEmoji(board.layout)}</Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {board.title}
      </Text>
      <Text style={styles.cardLayout}>{layoutLabel(board.layout)}</Text>
      {quizRoom?.status === "active" ? (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingText: { ...typography.body, color: colors.textMuted },

  errorCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  errorEmoji: { fontSize: 72 },
  errorTitle: { ...typography.title, color: colors.text },
  errorMsg: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  retryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radii.card,
    ...shadows.accent,
  },
  retryBtnPressed: { backgroundColor: colors.accentActive },
  retryText: { ...typography.subtitle, color: "#fff" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  greeting: { ...typography.display, color: colors.text },
  classroom: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs },
  logoutBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  logoutBtnPressed: { backgroundColor: colors.surfaceAlt },
  logoutText: { ...typography.label, color: colors.textMuted },
  gridContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  gridRow: { gap: spacing.lg },
  card: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
    position: "relative",
  },
  cardPressed: {
    backgroundColor: colors.surfaceAlt,
    transform: [{ scale: 0.98 }],
  },
  cardEmojiWrap: { marginBottom: spacing.md },
  cardEmoji: { fontSize: 56 },
  cardTitle: { ...typography.section, color: colors.text, textAlign: "center" },
  cardLayout: { ...typography.label, color: colors.textFaint, marginTop: spacing.xs },
  liveBadge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
  },
  liveText: {
    ...typography.badge,
    color: "#fff",
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { ...typography.title, color: colors.text },
  emptyMsg: { ...typography.body, color: colors.textMuted, textAlign: "center" },
});
