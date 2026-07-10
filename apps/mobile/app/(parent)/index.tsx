import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError, parentApiFetch } from "../../lib/api";
import {
  clearParentSession,
  loadParentCache,
  loadParentSelectedChild,
  loadParentToken,
  saveParentCache,
  saveParentSelectedChild,
} from "../../lib/session";
import type {
  ParentChild,
  ParentChildrenResponse,
  ParentPendingLink,
  PortfolioCardDTO,
} from "../../lib/types";
import { useParentFeed } from "../../hooks/use-parent-feed";
import { CardDetailModal } from "../../components/CardDetailModal";
import { ParentBottomNav } from "../../components/parent-bottom-nav";
import {
  ParentFeedCard,
  toParentFeedBoardCard,
} from "../../components/parent-feed-card";
import {
  AppButton,
  AppHeader,
  ControlPressable,
  EmptyState,
  SurfaceCard,
} from "../../components/ui";
import {
  borders,
  colors,
  iconSizes,
  parent,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";

export default function ParentHome() {
  const router = useRouter();
  const listRef = useRef<FlatList<PortfolioCardDTO>>(null);
  const [parentName, setParentName] = useState("학부모");
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [pendingLinks, setPendingLinks] = useState<ParentPendingLink[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(true);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<PortfolioCardDTO | null>(null);

  const handleUnauthorized = useCallback(async () => {
    await clearParentSession();
    router.replace(
      "/(parent)/login?error=로그인이 만료되었어요. 다시 로그인해 주세요.",
    );
  }, [router]);

  const loadChildren = useCallback(
    async (showLoading: boolean) => {
      if (showLoading) setChildrenLoading(true);
      const [cached, storedSelectedChild] = await Promise.all([
        loadParentCache(),
        loadParentSelectedChild(),
      ]);
      if (cached?.name) setParentName(cached.name);

      const token = await loadParentToken();
      if (!token) {
        router.replace("/(parent)/login");
        return;
      }

      try {
        const response = await parentApiFetch<ParentChildrenResponse>(
          "/api/parent/children",
        );
        const nextParentName = response.parent.name || "학부모";
        void saveParentCache({
          id: response.parent.id,
          name: nextParentName,
          email: response.parent.email,
          linkedStudentIds: response.children.map((child) => child.studentId),
        });
        setParentName(nextParentName);
        setChildren(response.children);
        setPendingLinks(response.pendingLinks);
        setSelectedChildId((current) =>
          response.children.some(
            (child) => child.studentId === (current ?? storedSelectedChild),
          )
            ? (current ?? storedSelectedChild)
            : response.children[0]?.studentId ?? null,
        );
        setChildrenError(null);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await handleUnauthorized();
          return;
        }
        setChildrenError("자녀 정보를 불러오지 못했어요.");
      } finally {
        setChildrenLoading(false);
      }
    },
    [handleUnauthorized, router],
  );

  useEffect(() => {
    void loadChildren(true);
  }, [loadChildren]);

  const feed = useParentFeed({
    childId: selectedChildId,
    onUnauthorized: handleUnauthorized,
  });

  const selectedChild =
    children.find((child) => child.studentId === selectedChildId) ?? null;
  const modalCard = useMemo(
    () =>
      openCard
        ? toParentFeedBoardCard(
            openCard,
            feed.child?.name ?? selectedChild?.name ?? "자녀",
          )
        : null,
    [feed.child?.name, openCard, selectedChild?.name],
  );

  const selectChild = useCallback((studentId: string) => {
    setOpenCard(null);
    setSelectedChildId(studentId);
    void saveParentSelectedChild(studentId);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const handleRefresh = useCallback(async () => {
    await Promise.all([loadChildren(false), feed.refresh()]);
  }, [feed, loadChildren]);

  if (childrenLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text selectable style={styles.mutedText}>
            자녀 피드를 준비하고 있어요.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const childName = feed.child?.name ?? selectedChild?.name ?? "자녀";
  const isSwitchingChild = Boolean(
    selectedChildId && feed.child?.id !== selectedChildId,
  );
  const visibleItems = isSwitchingChild ? [] : feed.items;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader
        title="자녀 피드"
        right={
          <Text selectable style={styles.parentName} numberOfLines={1}>
            {parentName}
          </Text>
        }
      />

      <FlatList
        ref={listRef}
        data={visibleItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ParentFeedCard
            card={item}
            childName={childName}
            onOpen={setOpenCard}
          />
        )}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.listContent}
        refreshing={feed.refreshing}
        onRefresh={handleRefresh}
        onEndReached={() => void feed.loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {children.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.childStrip}
                accessibilityRole="tablist"
              >
                {children.map((child) => {
                  const selected = child.studentId === selectedChildId;
                  return (
                    <ControlPressable
                      key={child.studentId}
                      style={[
                        styles.childChip,
                        selected && styles.childChipSelected,
                      ]}
                      onPress={() => selectChild(child.studentId)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${child.name}, ${child.classroom?.name ?? "학급 미배정"}`}
                    >
                      <View
                        style={[
                          styles.childAvatar,
                          selected && styles.childAvatarSelected,
                        ]}
                      >
                        <Text style={styles.childAvatarText}>
                          {child.name.slice(0, 1)}
                        </Text>
                      </View>
                      <Text
                        selectable
                        style={[
                          styles.childChipText,
                          selected && styles.childChipTextSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {child.name}
                      </Text>
                    </ControlPressable>
                  );
                })}
              </ScrollView>
            ) : null}

            {pendingLinks.length > 0 ? (
              <SurfaceCard style={styles.pendingCard}>
                <Text selectable style={styles.pendingTitle}>
                  승인 대기 {pendingLinks.length}건
                </Text>
                <Text selectable style={styles.pendingText} numberOfLines={2}>
                  {pendingLinks.map((item) => item.name).join(", ")} 학생의 연결을
                  선생님이 확인하고 있어요.
                </Text>
              </SurfaceCard>
            ) : null}

            {selectedChild ? (
              <View style={styles.profileSummary}>
                <Text selectable style={styles.profileTitle}>
                  {childName}의 새 소식
                </Text>
                <Text selectable style={styles.profileSubtitle}>
                  {feed.child?.classroomName ??
                    selectedChild.classroom?.name ??
                    "학급 미배정"}
                  {selectedChild.number != null
                    ? ` · ${selectedChild.number}번`
                    : ""}
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          feed.loading || isSwitchingChild ? (
            <View style={styles.feedLoading}>
              <ActivityIndicator color={colors.accent} />
              <Text selectable style={styles.mutedText}>
                게시물을 불러오는 중이에요.
              </Text>
            </View>
          ) : childrenError ? (
            <EmptyState
              icon={<Text style={styles.emptyEmoji}>!</Text>}
              title="자녀 정보를 불러오지 못했어요"
              description={childrenError}
              action={<AppButton onPress={() => loadChildren(true)}>다시 시도</AppButton>}
            />
          ) : children.length === 0 ? (
            <EmptyState
              icon={<Text style={styles.emptyEmoji}>👨‍👩‍👧</Text>}
              title="연결된 자녀가 없어요"
              description="자녀를 연결하면 새 게시물이 이 피드에 나타나요."
              action={
                <AppButton onPress={() => router.push("/(parent)/link-child")}>
                  자녀 연결하기
                </AppButton>
              }
            />
          ) : feed.error ? (
            <EmptyState
              icon={<Text style={styles.emptyEmoji}>↻</Text>}
              title="피드를 불러오지 못했어요"
              description={feed.error}
              action={<AppButton onPress={feed.retry}>다시 시도</AppButton>}
            />
          ) : (
            <EmptyState
              icon={<Text style={styles.emptyEmoji}>📭</Text>}
              title="아직 게시물이 없어요"
              description="자녀가 보드에 작품을 올리면 이곳에서 바로 확인할 수 있어요."
            />
          )
        }
        ListFooterComponent={
          feed.loadingMore ? (
            <ActivityIndicator style={styles.footerLoader} color={colors.accent} />
          ) : feed.hasMore ? (
            <View style={styles.footerSpace} />
          ) : null
        }
      />

      <ParentBottomNav
        active="home"
        notificationCount={pendingLinks.length}
        onHomePress={() =>
          listRef.current?.scrollToOffset({ offset: 0, animated: true })
        }
      />
      <CardDetailModal card={modalCard} onClose={() => setOpenCard(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  parentName: {
    ...typography.label,
    color: colors.textMuted,
    maxWidth: parent.feedHeaderNameMaxWidth,
  },
  listContent: {
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  listHeader: {
    gap: spacing.lg,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  childStrip: { gap: spacing.sm, paddingRight: spacing.lg },
  childChip: {
    minWidth: parent.navMinWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
    gap: spacing.xs,
    borderColor: colors.transparent,
    backgroundColor: colors.transparent,
  },
  childChipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  childAvatar: {
    width: parent.childAvatarSize,
    height: parent.childAvatarSize,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
  childAvatarSelected: { borderColor: colors.accent },
  childAvatarText: { ...typography.subtitle, color: colors.accentTintedText },
  childChipText: {
    ...typography.label,
    color: colors.textMuted,
    maxWidth: parent.feedChildNameMaxWidth,
  },
  childChipTextSelected: { color: colors.accentTintedText },
  pendingCard: {
    padding: spacing.lg,
    gap: spacing.xs,
    backgroundColor: colors.statusSubmittedBg,
  },
  pendingTitle: { ...typography.label, color: colors.statusSubmittedText },
  pendingText: { ...typography.body, color: colors.textMuted },
  profileSummary: { gap: spacing.xs },
  profileTitle: { ...typography.title, color: colors.text },
  profileSubtitle: { ...typography.body, color: colors.textMuted },
  feedLoading: {
    minHeight: parent.portfolioEmptyMinHeight,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  mutedText: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  emptyEmoji: { fontSize: iconSizes.empty },
  footerLoader: { padding: spacing.xl },
  footerSpace: { height: spacing.xl },
});
