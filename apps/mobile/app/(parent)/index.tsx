import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  colors,
  iconSizes,
  parent,
  spacing,
  typography,
} from "../../theme/tokens";
import { ApiError, apiFetch } from "../../lib/api";
import {
  clearParentSession,
  loadParentCache,
  loadParentToken,
  saveParentCache,
} from "../../lib/session";
import type {
  ParentChild,
  ParentChildrenResponse,
  ParentPendingLink,
} from "../../lib/types";
import {
  AppButton,
  EmptyState,
  SurfaceCard,
  SurfacePressable,
} from "../../components/ui";

export default function ParentHome() {
  const router = useRouter();
  const [parentName, setParentName] = useState("학부모");
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [pendingLinks, setPendingLinks] = useState<ParentPendingLink[]>([]);
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
          const nextParentName = res.parent.name || "학부모";
          void saveParentCache({
            id: res.parent.id,
            name: nextParentName,
            email: res.parent.email,
            linkedStudentIds: res.children.map((child) => child.studentId),
          });
          setParentName(nextParentName);
          setChildren(res.children);
          setPendingLinks(res.pendingLinks);
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
          setPendingLinks([]);
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

  const firstClassroomId = children.find((child) => child.classroom?.id)?.classroom?.id;

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
        <View style={styles.headerCopy}>
          <Text style={styles.greeting}>{parentName}님, 안녕하세요!</Text>
          <Text style={styles.subText}>
            자녀 {children.length}명 · 활동을 확인하세요
            {pendingLinks.length > 0 ? ` · 승인 대기 ${pendingLinks.length}건` : ""}
          </Text>
        </View>
        <View style={styles.actions}>
          {firstClassroomId ? (
            <AppButton
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: "/(parent)/showcase",
                  params: { classroomId: firstClassroomId },
                } as unknown as Href)
              }
            >
              자랑해요
            </AppButton>
          ) : null}
          <AppButton
            onPress={() => router.push("./link-child")}
          >
            + 자녀 연결
          </AppButton>
          <AppButton
            variant="secondary"
            onPress={handleLogout}
          >
            로그아웃
          </AppButton>
        </View>
      </View>

      {error ? (
        <SurfaceCard style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </SurfaceCard>
      ) : null}

      <FlatList
        data={children}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <SurfacePressable
            style={styles.childCard}
            onPress={() =>
              router.push(`/(parent)/child/${item.studentId}`)
            }
          >
            <View style={styles.childAvatar}>
              <Text style={styles.childEmoji}>🧒</Text>
            </View>
            <View style={styles.childInfo}>
              <Text style={styles.childName}>{item.name}</Text>
              <Text style={styles.childClass}>
                {item.classroom?.name ?? "학급 미배정"}
                {item.number != null ? ` · ${item.number}번` : ""}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </SurfacePressable>
        )}
        ListHeaderComponent={
          pendingLinks.length > 0 ? (
            <View style={styles.pendingSection}>
              <Text style={styles.pendingTitle}>승인 대기 중</Text>
              {pendingLinks.map((item) => (
                <PendingLinkCard key={item.id} item={item} />
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            style={styles.emptyState}
            icon={<Text style={styles.emptyEmoji}>👨‍👩‍👧</Text>}
            title="연결된 자녀가 없어요"
            description="학교에서 자녀 연결을 설정하면 여기에 나타나요."
            action={(
              <AppButton onPress={() => router.push("./link-child")}>
                자녀 연결하기
              </AppButton>
            )}
          />
        }
      />
    </SafeAreaView>
  );
}

function PendingLinkCard({ item }: { item: ParentPendingLink }) {
  return (
    <SurfaceCard style={styles.pendingCard}>
      <View style={styles.childAvatar}>
        <Text style={styles.childEmoji}>🕒</Text>
      </View>
      <View style={styles.childInfo}>
        <Text style={styles.childName}>{item.name}</Text>
        <Text style={styles.childClass}>
          {item.classroom?.name ?? "학급 미배정"}
          {item.number != null ? ` · ${item.number}번` : ""}
        </Text>
        <Text style={styles.pendingMeta}>
          선생님 승인 대기 · {formatPendingExpiry(item.expiresAt)}
        </Text>
      </View>
    </SurfaceCard>
  );
}

function formatPendingExpiry(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "만료일 확인 중";
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "오늘 만료";
  return `${days}일 후 만료`;
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
    flexWrap: "wrap",
    gap: spacing.md,
  },
  headerCopy: { flex: 1 },
  errorBanner: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.lg,
    padding: spacing.lg,
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
  pendingSection: {
    gap: spacing.md,
  },
  pendingTitle: { ...typography.title, color: colors.text },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.statusSubmittedBg,
  },
  pendingMeta: { ...typography.micro, color: colors.statusSubmittedText },
  childCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  childAvatar: {
    width: parent.childDetailAvatarSize,
    height: parent.childDetailAvatarSize,
    borderRadius: parent.childDetailAvatarSize,
    backgroundColor: colors.accentTintedBg,
    alignItems: "center",
    justifyContent: "center",
  },
  childEmoji: { fontSize: iconSizes.lg },
  childInfo: { flex: 1, gap: spacing.xs },
  childName: { ...typography.subtitle, color: colors.text },
  childClass: { ...typography.body, color: colors.textMuted },
  chevron: {
    fontSize: iconSizes.lg,
    color: colors.textFaint,
    fontWeight: "300",
  },
  emptyState: {
    paddingTop: spacing.xxxl,
  },
  emptyEmoji: { fontSize: iconSizes.empty },
});
