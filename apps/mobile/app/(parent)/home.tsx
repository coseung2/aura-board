import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Check, ChevronDown } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ParentBottomNav } from "../../components/parent-bottom-nav";
import { ParentFeedCard } from "../../components/parent-feed-card";
import { ParentHeaderActions } from "../../components/parent-header-actions";
import {
  AppButton,
  AppHeader,
  ControlPressable,
  EmptyState,
  SectionHeader,
} from "../../components/ui";
import {
  SectionNav,
  SectionNavItem,
} from "../../components/NavigationTabs";
import { useParentChildPosts } from "../../hooks/use-parent-child-posts";
import { useParentOverview } from "../../hooks/use-parent-overview";
import {
  clearParentSession,
  loadParentSelectedChild,
  saveParentSelectedChild,
} from "../../lib/session";
import { getPortfolioCardThumbnailUrl } from "../../lib/portfolio-card";
import type { ParentPostDTO } from "../../lib/types";
import {
  borders,
  colors,
  iconSizes,
  parent,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";

type ContentKind = "media" | "text";

export default function ParentHomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [kind, setKind] = useState<ContentKind>("media");
  const [childMenuOpen, setChildMenuOpen] = useState(false);

  const handleUnauthorized = useCallback(async () => {
    await clearParentSession();
    router.replace("/?role=parent&error=로그인이 만료되었어요. 다시 로그인해 주세요.");
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
  const columns =
    width >= 980
      ? parent.gridWideColumns
      : width >= 640
        ? parent.gridTabletColumns
        : parent.gridPhoneColumns;
  const tileWidth = Math.floor(
    (width - spacing.lg * 2 - parent.gridTileGap * (columns - 1)) / columns,
  );
  const gridKey = `${columns}-${selectedChildId ?? "none"}-${kind}`;

  const header = useMemo(
    () => (
      <View style={styles.headerContent}>
        {selectedChild ? (
          <>
            <View style={styles.childSelector}>
              <ControlPressable
                style={styles.childSelectTrigger}
                onPress={() => setChildMenuOpen((open) => !open)}
                accessibilityLabel="자녀 전환"
                accessibilityState={{ expanded: childMenuOpen }}
              >
                <Text style={styles.childSelectText} numberOfLines={1}>
                  {selectedChild.name}({selectedChild.classroom?.name ?? "학급 미배정"})
                </Text>
                <ChevronDown
                  size={iconSizes.sm}
                  color={colors.textMuted}
                  accessible={false}
                />
              </ControlPressable>
              {childMenuOpen ? (
                <View style={styles.childMenu} accessibilityRole="menu">
                  {overview.children.map((child) => {
                    const selected = child.studentId === selectedChildId;
                    return (
                      <ControlPressable
                        key={child.studentId}
                        style={styles.childOption}
                        onPress={() => {
                          setSelectedChildId(child.studentId);
                          setChildMenuOpen(false);
                        }}
                        accessibilityRole="menuitem"
                        accessibilityState={{ selected }}
                      >
                        <Text style={styles.childOptionText} numberOfLines={1}>
                          {child.name}({child.classroom?.name ?? "학급 미배정"})
                        </Text>
                        {selected ? (
                          <Check
                            size={iconSizes.sm}
                            color={colors.accent}
                            accessible={false}
                          />
                        ) : null}
                      </ControlPressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
            <SectionHeader
              style={styles.profileHeading}
              title={`${selectedChild.name}(${selectedChild.classroom?.name ?? "학급 미배정"})`}
              right={
                <SectionNav
                  style={styles.kindNav}
                  accessibilityLabel="게시물 종류"
                >
                  {(["media", "text"] as const).map((value) => (
                    <SectionNavItem
                      key={value}
                      style={styles.kindNavItem}
                      selected={kind === value}
                      onPress={() => setKind(value)}
                    >
                      {value === "media"
                        ? `미디어 ${posts.counts.media}`
                        : `텍스트 ${posts.counts.text}`}
                    </SectionNavItem>
                  ))}
                </SectionNav>
              }
            />
          </>
        ) : null}
      </View>
    ),
    [
      childMenuOpen,
      kind,
      overview.children,
      posts.counts.media,
      posts.counts.text,
      selectedChild,
      selectedChildId,
    ],
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
          <ParentHeaderActions
            notificationCount={overview.pendingLinks.length}
          />
        }
      />

      <FlatList
        key={gridKey}
        data={posts.items}
        numColumns={kind === "media" ? columns : 1}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) =>
          kind === "media" ? (
            <PostGridTile
              post={item}
              kind={kind}
              width={tileWidth}
              onPress={() =>
                router.push({ pathname: "/(parent)", params: { post: item.id } })
              }
            />
          ) : (
            <ControlPressable
              style={styles.textFeedItem}
              onPress={() =>
                router.push({ pathname: "/(parent)", params: { post: item.id } })
              }
              accessibilityLabel={`${item.title.trim() || "텍스트 게시물"} 피드에서 보기`}
            >
              <ParentFeedCard card={item} childName={selectedChild?.name} />
            </ControlPressable>
          )
        }
        columnWrapperStyle={kind === "media" ? styles.gridRow : undefined}
        contentContainerStyle={
          kind === "media" ? styles.gridContent : styles.feedContent
        }
        ItemSeparatorComponent={
          kind === "text"
            ? () => <View style={styles.feedSeparator} />
            : undefined
        }
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

function PostGridTile({
  post,
  width,
  onPress,
}: {
  post: ParentPostDTO;
  kind: ContentKind;
  width: number;
  onPress: () => void;
}) {
  const preview = getPostPreview(post);
  const title = post.title.trim() || "교실 기록";

  return (
    <ControlPressable
      style={[styles.tile, { width }]}
      onPress={onPress}
      accessibilityLabel={`${title} 피드에서 보기`}
    >
      {preview ? (
        <Image source={{ uri: preview }} style={styles.tileImage} contentFit="cover" />
      ) : (
        <View style={styles.mediaFallback}>
          <Text style={styles.mediaFallbackIcon}>□</Text>
          <Text selectable style={styles.mediaFallbackText} numberOfLines={2}>
            {title}
          </Text>
        </View>
      )}
    </ControlPressable>
  );
}

function getPostPreview(post: ParentPostDTO): string | null {
  return getPortfolioCardThumbnailUrl(post);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  gridContent: { flexGrow: 1, paddingBottom: spacing.xl },
  feedContent: { flexGrow: 1, paddingBottom: spacing.xl },
  feedSeparator: {
    height: borders.hairline,
    marginVertical: spacing.lg,
    backgroundColor: colors.border,
  },
  textFeedItem: {
    width: "100%",
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  gridRow: {
    gap: parent.gridTileGap,
    paddingHorizontal: spacing.lg,
    paddingBottom: parent.gridTileGap,
  },
  headerContent: { gap: spacing.lg, paddingVertical: spacing.lg },
  childSelector: { alignItems: "center", paddingHorizontal: spacing.lg },
  childSelectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.transparent,
    borderWidth: borders.none,
  },
  childSelectText: { ...typography.label, color: colors.text },
  childMenu: {
    width: "100%",
    marginTop: spacing.xs,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  childOption: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: borders.none,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  childOptionText: { ...typography.label, color: colors.text },
  profileHeading: { marginHorizontal: spacing.lg },
  kindNav: { borderBottomWidth: borders.none },
  kindNavItem: { width: parent.navMinWidth },
  tile: {
    aspectRatio: 1,
    overflow: "hidden",
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.surfaceAlt,
  },
  tileImage: { width: "100%", height: "100%" },
  mediaFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.accentTintedBg,
  },
  mediaFallbackIcon: { fontSize: iconSizes.md, color: colors.accent },
  mediaFallbackText: {
    ...typography.micro,
    color: colors.accentTintedText,
    textAlign: "center",
  },
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
});
