import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Bell, UserPlus, UserRound } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ParentBottomNav } from "../../components/parent-bottom-nav";
import { ParentFeedCard } from "../../components/parent-feed-card";
import {
  AppButton,
  AppHeader,
  ControlPressable,
  EmptyState,
  IconButton,
  SemanticNav,
  SemanticNavItem,
} from "../../components/ui";
import { useParentChildPosts } from "../../hooks/use-parent-child-posts";
import { useParentOverview } from "../../hooks/use-parent-overview";
import {
  clearParentSession,
  loadParentSelectedChild,
  saveParentSelectedChild,
} from "../../lib/session";
import {
  borders,
  colors,
  iconSizes,
  parent,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";

type ContentKind = "media" | "text";

export default function ParentHomeScreen() {
  const router = useRouter();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [kind, setKind] = useState<ContentKind>("media");

  const handleUnauthorized = useCallback(async () => {
    await clearParentSession();
    router.replace(
      "/(parent)/login?error=로그인이 만료되었어요. 다시 로그인해 주세요.",
    );
  }, [router]);

  const overview = useParentOverview(handleUnauthorized);

  useEffect(() => {
    if (overview.loading) return;
    void loadParentSelectedChild().then((stored) => {
      setSelectedChildId((current) => {
        const candidate = current ?? stored;
        return overview.children.some((child) => child.studentId === candidate)
          ? candidate
          : overview.children[0]?.studentId ?? null;
      });
    });
  }, [overview.children, overview.loading]);

  useEffect(() => {
    if (selectedChildId) void saveParentSelectedChild(selectedChildId);
  }, [selectedChildId]);

  const posts = useParentChildPosts({
    childId: selectedChildId,
    kind,
    onUnauthorized: handleUnauthorized,
  });
  const selectedChild =
    overview.children.find((child) => child.studentId === selectedChildId) ?? null;

  const header = useMemo(
    () => (
      <View style={styles.headerContent}>
        <View style={styles.utilityRow} accessibilityLabel="홈 바로가기">
          <ControlPressable
            style={styles.utilityButton}
            onPress={() => router.push("/(parent)/link-child")}
            accessibilityLabel="자녀 추가"
          >
            <UserPlus
              size={iconSizes.sm}
              color={colors.textMuted}
              strokeWidth={2}
            />
            <Text style={styles.utilityText}>자녀 추가</Text>
          </ControlPressable>
          <ControlPressable
            style={styles.utilityButton}
            onPress={() => router.push("/(parent)/account")}
            accessibilityLabel="계정"
          >
            <UserRound
              size={iconSizes.sm}
              color={colors.textMuted}
              strokeWidth={2}
            />
            <Text style={styles.utilityText}>계정</Text>
          </ControlPressable>
        </View>

        {overview.children.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.childTabs}
            accessibilityRole="tablist"
            accessibilityLabel="자녀 프로필"
          >
            {overview.children.map((child) => {
              const selected = child.studentId === selectedChildId;
              return (
                <ControlPressable
                  key={child.studentId}
                  style={[styles.childTab, selected && styles.childTabSelected]}
                  onPress={() => setSelectedChildId(child.studentId)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${child.name}, ${
                    child.classroom?.name ?? "학급 미배정"
                  }`}
                >
                  <View style={[styles.avatar, selected && styles.avatarSelected]}>
                    <Text
                      style={[
                        styles.avatarText,
                        selected && styles.avatarTextSelected,
                      ]}
                    >
                      {child.name.trim().slice(0, 1) || "아"}
                    </Text>
                  </View>
                  <Text
                    selectable
                    style={[
                      styles.childName,
                      selected && styles.childNameSelected,
                    ]}
                  >
                    {child.name}
                  </Text>
                  <Text selectable style={styles.childMeta} numberOfLines={1}>
                    {child.classroom?.name ?? "학급 미배정"}
                    {child.number != null ? ` · ${child.number}번` : ""}
                  </Text>
                </ControlPressable>
              );
            })}
          </ScrollView>
        ) : null}

        {selectedChild ? (
          <View style={styles.profileHeading}>
            <Text
              selectable
              accessibilityRole="header"
              style={styles.profileTitle}
            >
              {selectedChild.name}
            </Text>
            <Text selectable style={styles.profileSubtitle}>
              {selectedChild.classroom?.name ?? "학급 미배정"}의 게시물
            </Text>
          </View>
        ) : null}

        {selectedChild ? (
          <SemanticNav
            style={styles.kindTabs}
            accessibilityLabel="게시물 종류"
          >
            {(["media", "text"] as const).map((value) => (
              <SemanticNavItem
                key={value}
                style={styles.kindTab}
                selected={kind === value}
                onPress={() => setKind(value)}
              >
                {value === "media" ? "미디어" : "텍스트"}
              </SemanticNavItem>
            ))}
          </SemanticNav>
        ) : null}
      </View>
    ),
    [kind, overview.children, router, selectedChild, selectedChildId],
  );

  if (overview.loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text selectable style={styles.muted}>
            홈을 준비하고 있어요.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader
        title="홈"
        right={
          <IconButton
            onPress={() => router.push("/(parent)/notifications")}
            accessibilityLabel={
              overview.pendingLinks.length > 0
                ? `알림 ${overview.pendingLinks.length}건`
                : "알림 보기"
            }
          >
            <Bell size={iconSizes.md} color={colors.textMuted} strokeWidth={2} />
            {overview.pendingLinks.length > 0 ? (
              <View style={styles.notificationDot} />
            ) : null}
          </IconButton>
        }
      />

      <FlatList
        key={`${selectedChildId ?? "none"}-${kind}`}
        data={posts.items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ParentFeedCard card={item} childName={selectedChild?.name} />
        )}
        ItemSeparatorComponent={() => <View style={styles.postSeparator} />}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={header}
        refreshing={overview.refreshing || posts.refreshing}
        onRefresh={() => void Promise.all([overview.reload(), posts.refresh()])}
        onEndReached={() => void posts.loadMore()}
        onEndReachedThreshold={0.35}
        ListEmptyComponent={
          overview.error && overview.children.length === 0 ? (
            <EmptyState
              title="자녀 정보를 불러오지 못했어요"
              description={overview.error}
              action={<AppButton onPress={overview.reload}>다시 시도</AppButton>}
            />
          ) : overview.children.length === 0 ? (
            <EmptyState
              title="연결된 자녀가 없어요"
              description="자녀를 연결하면 교실에서 만든 게시물을 확인할 수 있어요."
              action={
                <AppButton onPress={() => router.push("/(parent)/link-child")}>
                  자녀 연결하기
                </AppButton>
              }
            />
          ) : posts.loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
              <Text selectable style={styles.muted}>
                게시물을 불러오는 중이에요.
              </Text>
            </View>
          ) : posts.error ? (
            <EmptyState
              title="게시물을 불러오지 못했어요"
              description={posts.error}
              action={<AppButton onPress={posts.retry}>다시 시도</AppButton>}
            />
          ) : (
            <EmptyState
              title={`아직 ${kind === "media" ? "미디어" : "텍스트"} 게시물이 없어요`}
              description={`${selectedChild?.name ?? "자녀"}의 게시물이 생기면 여기에 표시돼요.`}
            />
          )
        }
        ListFooterComponent={
          posts.loadingMore ? (
            <ActivityIndicator style={styles.footer} color={colors.accent} />
          ) : posts.loadMoreError ? (
            <View style={styles.footerError}>
              <Text selectable style={styles.muted}>
                {posts.loadMoreError}
              </Text>
              <AppButton variant="quiet" onPress={posts.loadMore}>
                다시 불러오기
              </AppButton>
            </View>
          ) : null
        }
      />

      <ParentBottomNav active="home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { flexGrow: 1, paddingBottom: spacing.xl },
  postSeparator: {
    height: borders.hairline,
    marginVertical: spacing.lg,
    backgroundColor: colors.border,
  },
  headerContent: { gap: spacing.lg, paddingVertical: spacing.lg },
  utilityRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  utilityButton: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  utilityText: { ...typography.label, color: colors.textMuted },
  childTabs: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  childTab: {
    minWidth: 104,
    minHeight: tapMin,
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.sm,
    borderWidth: borders.hairline,
    borderColor: colors.transparent,
    borderRadius: radii.control,
    backgroundColor: colors.transparent,
  },
  childTabSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  avatar: {
    width: parent.childAvatarSize,
    height: parent.childAvatarSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  avatarSelected: { borderColor: colors.accent },
  avatarText: { ...typography.subtitle, color: colors.textMuted },
  avatarTextSelected: { color: colors.accent },
  childName: { ...typography.label, color: colors.textMuted },
  childNameSelected: { color: colors.accentTintedText },
  childMeta: {
    ...typography.micro,
    color: colors.textFaint,
    maxWidth: parent.feedHeaderNameMaxWidth,
  },
  profileHeading: { gap: spacing.xs, paddingHorizontal: spacing.lg },
  profileTitle: { ...typography.title, color: colors.text },
  profileSubtitle: { ...typography.body, color: colors.textMuted },
  kindTabs: { marginHorizontal: spacing.lg },
  kindTab: { flex: 1 },
  center: {
    minHeight: parent.contentEmptyMinHeight,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  muted: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  footer: { padding: spacing.xl },
  footerError: { alignItems: "center", gap: spacing.sm, padding: spacing.lg },
  notificationDot: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.danger,
  },
});
