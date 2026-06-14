import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  colors,
  radii,
  shadows,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { ApiError, apiFetch } from "../../lib/api";
import {
  clearParentSession,
  loadParentCache,
  loadParentToken,
} from "../../lib/session";
import type { ParentChild, ParentChildrenResponse } from "../../lib/types";

export default function ParentHome() {
  const router = useRouter();
  const [parentName, setParentName] = useState("학부모");
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const cached = await loadParentCache();
      if (mounted && cached?.name) setParentName(cached.name);

      const token = await loadParentToken();
      if (!token) {
        if (mounted) {
          router.replace("/(parent)/login");
        }
        return;
      }

      try {
        const res = await apiFetch<ParentChildrenResponse>(
          "/api/parent/children",
          { parentAuth: true },
        );
        if (mounted) {
          setChildren(res.children);
          setError(null);
        }
      } catch (e) {
        if (mounted) {
          if (e instanceof ApiError && e.status === 401) {
            await clearParentSession();
            router.replace(
              "/(parent)/login?error=로그인이 만료되었어요. 다시 로그인해 주세요.",
            );
            return;
          }
          setError("자녀 목록을 불러오지 못했어요.");
          setChildren([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  const handleLogout = useCallback(async () => {
    await clearParentSession();
    router.replace("/");
  }, [router]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>불러오는 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{parentName}님, 안녕하세요!</Text>
          <Text style={styles.subText}>
            자녀 {children.length}명 · 활동을 확인하세요
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.addBtn,
              pressed && styles.addBtnPressed,
            ]}
            onPress={() => router.push("/(parent)/link-child" as any)}
          >
            <Text style={styles.addText}>+ 자녀 연결</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.logoutBtn,
              pressed && styles.logoutBtnPressed,
            ]}
            onPress={handleLogout}
          >
            <Text style={styles.logoutText}>로그아웃</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={children}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.childCard,
              pressed && styles.childCardPressed,
            ]}
            onPress={() =>
              router.push(`/(parent)/child/${item.studentId}`)
            }
          >
            <View style={styles.childAvatar}>
              <Text style={styles.childEmoji}>👦</Text>
            </View>
            <View style={styles.childInfo}>
              <Text style={styles.childName}>{item.name}</Text>
              <Text style={styles.childClass}>
                {item.classroom?.name ?? "학급 미배정"}
                {item.number != null ? ` · ${item.number}번` : ""}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>👨‍👩‍👧</Text>
            <Text style={styles.emptyTitle}>연결된 자녀가 없어요</Text>
            <Text style={styles.emptyMsg}>
              학교에서 자녀 연결을 설정하면 여기에 나타나요.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.linkBtn,
                pressed && styles.linkBtnPressed,
              ]}
              onPress={() => router.push("/(parent)/link-child" as any)}
            >
              <Text style={styles.linkBtnText}>자녀 연결하기</Text>
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: { ...typography.body, color: colors.textMuted },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  greeting: { ...typography.display, color: colors.text },
  subText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  addBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.accent,
  },
  addBtnPressed: { backgroundColor: colors.accentActive },
  addText: { ...typography.label, color: "#fff" },
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
  errorBanner: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.statusReturnedBg,
  },
  errorBannerText: {
    ...typography.body,
    color: colors.statusReturnedText,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  linkBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radii.card,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    minHeight: tapMin,
    ...shadows.accent,
  },
  linkBtnPressed: { backgroundColor: colors.accentActive },
  linkBtnText: { ...typography.subtitle, color: "#fff" },
  childCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadows.card,
  },
  childCardPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  childAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentTintedBg,
    alignItems: "center",
    justifyContent: "center",
  },
  childEmoji: { fontSize: 28 },
  childInfo: { flex: 1, gap: spacing.xs },
  childName: { ...typography.subtitle, color: colors.text },
  childClass: { ...typography.body, color: colors.textMuted },
  chevron: {
    fontSize: 28,
    color: colors.textFaint,
    fontWeight: "300",
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { ...typography.title, color: colors.text },
  emptyMsg: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
});
