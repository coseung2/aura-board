import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ParentBottomNav } from "../../components/parent-bottom-nav";
import { ParentHeaderActions } from "../../components/parent-header-actions";
import {
  AppButton,
  AppHeader,
  ControlPressable,
  EmptyState,
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
import type { ParentPostDTO } from "../../lib/types";
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
  const { width } = useWindowDimensions();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [kind, setKind] = useState<ContentKind>("media");

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
          <ParentHeaderActions
            notificationCount={overview.pendingLinks.length}
          />
        }
      />

      <FlatList
        key={gridKey}
        data={posts.items}
        numColumns={columns}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostGridTile
            post={item}
            kind={kind}
            width={tileWidth}
            onPress={() =>
              router.push({ pathname: "/(parent)", params: { post: item.id } })
            }
          />
        )}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
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
  kind,
  width,
  onPress,
}: {
  post: ParentPostDTO;
  kind: ContentKind;
  width: number;
  onPress: () => void;
}) {
  const preview = getPostPreview(post);
  const title = post.title.trim() || (kind === "media" ? "교실 기록" : "텍스트 게시물");

  return (
    <ControlPressable
      style={[styles.tile, { width }, kind === "text" && styles.textTile]}
      onPress={onPress}
      accessibilityLabel={`${title} 피드에서 보기`}
    >
      {kind === "media" ? (
        preview ? (
          <Image source={{ uri: preview }} style={styles.tileImage} contentFit="cover" />
        ) : (
          <View style={styles.mediaFallback}>
            <Text style={styles.mediaFallbackIcon}>□</Text>
            <Text selectable style={styles.mediaFallbackText} numberOfLines={2}>
              {title}
            </Text>
          </View>
        )
      ) : (
        <View style={styles.textTileContent}>
          <Text selectable style={styles.textTileTitle} numberOfLines={3}>
            {title}
          </Text>
          {post.content.trim() ? (
            <Text selectable style={styles.textTileBody} numberOfLines={4}>
              {post.content.trim()}
            </Text>
          ) : null}
        </View>
      )}
    </ControlPressable>
  );
}

function getPostPreview(post: ParentPostDTO): string | null {
  return (
    post.thumbUrl ??
    post.imageUrl ??
    post.attachments.find((item) => item.kind === "image")?.previewUrl ??
    post.attachments.find((item) => item.kind === "image")?.url ??
    post.attachments.find((item) => item.kind === "video")?.previewUrl ??
    post.linkImage ??
    null
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  gridContent: { flexGrow: 1, paddingBottom: spacing.xl },
  gridRow: {
    gap: parent.gridTileGap,
    paddingHorizontal: spacing.lg,
    paddingBottom: parent.gridTileGap,
  },
  headerContent: { gap: spacing.lg, paddingVertical: spacing.lg },
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
  textTile: {
    borderWidth: borders.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  textTileContent: {
    flex: 1,
    justifyContent: "space-between",
    gap: spacing.xs,
    padding: spacing.sm,
  },
  textTileTitle: { ...typography.label, color: colors.text },
  textTileBody: { ...typography.micro, color: colors.textMuted },
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
