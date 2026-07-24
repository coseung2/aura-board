import { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, BackHandler, FlatList, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ParentBottomNav } from "../../components/parent-bottom-nav";
import { ParentFeedCard } from "../../components/parent-feed-card";
import { ParentHeaderActions } from "../../components/parent-header-actions";
import { AppButton, AppHeader, EmptyState } from "../../components/ui";
import { useParentFeed } from "../../hooks/use-parent-feed";
import {
  clearParentSession,
  getUnifiedLoginRoute,
  isParentLogoutInProgress,
  loadParentToken,
} from "../../lib/session";
import type { ParentPostDTO } from "../../lib/types";
import {
  borders,
  colors,
  parent,
  spacing,
  typography,
} from "../../theme/tokens";

export default function ParentFeedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ post?: string | string[] }>();
  const focusPostId = Array.isArray(params.post) ? params.post[0] : params.post;
  const listRef = useRef<FlatList<ParentPostDTO>>(null);
  const scrolledToFocusRef = useRef<string | null>(null);

  const handleUnauthorized = useCallback(async () => {
    await clearParentSession();
    router.replace("/?role=parent&error=로그인이 만료되었어요. 다시 로그인해 주세요.");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    void loadParentToken().then((token) => {
      if (!cancelled && !token && !isParentLogoutInProgress()) {
        router.replace(getUnifiedLoginRoute("parent"));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const feed = useParentFeed({ onUnauthorized: handleUnauthorized });

  const handleFocusedBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(parent)/home");
  }, [router]);

  useEffect(() => {
    if (!focusPostId) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        handleFocusedBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [focusPostId, handleFocusedBack]);

  useEffect(() => {
    scrolledToFocusRef.current = null;
  }, [focusPostId]);

  useEffect(() => {
    if (
      !focusPostId ||
      feed.loading ||
      feed.loadingMore ||
      feed.items.some((item) => item.id === focusPostId) ||
      !feed.hasMore
    ) {
      return;
    }
    void feed.loadMore();
  }, [
    feed.hasMore,
    feed.items,
    feed.loadMore,
    feed.loading,
    feed.loadingMore,
    focusPostId,
  ]);

  useEffect(() => {
    if (!focusPostId || feed.loading || feed.items.length === 0) return;
    if (scrolledToFocusRef.current === focusPostId) return;
    const index = feed.items.findIndex((item) => item.id === focusPostId);
    if (index < 0) return;
    scrolledToFocusRef.current = focusPostId;
    const handle = setTimeout(() => {
      listRef.current?.scrollToIndex({
        index,
        animated: false,
        viewPosition: 0.15,
      });
    }, 50);
    return () => clearTimeout(handle);
  }, [feed.items, feed.loading, focusPostId]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader
        title="피드"
        onBack={focusPostId ? handleFocusedBack : undefined}
        right={<ParentHeaderActions />}
      />

      <FlatList
        ref={listRef}
        data={feed.items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ParentFeedCard card={item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        refreshing={feed.refreshing}
        onRefresh={feed.refresh}
        onEndReached={() => void feed.loadMore()}
        onEndReachedThreshold={0.4}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          listRef.current?.scrollToOffset({
            offset: Math.max(0, averageItemLength * index),
            animated: false,
          });
          requestAnimationFrame(() => {
            listRef.current?.scrollToIndex({
              index,
              animated: false,
              viewPosition: 0.15,
            });
          });
        }}
        ListHeaderComponent={
          feed.items.length > 0 ? <View style={styles.feedTopSpacer} /> : null
        }
        ListEmptyComponent={
          feed.loading ? (
            <View style={styles.center} accessibilityLabel="피드를 불러오는 중">
              <ActivityIndicator size="large" color={colors.accent} />
              <Text selectable style={styles.muted}>게시물을 불러오는 중이에요.</Text>
            </View>
          ) : feed.error ? (
            <EmptyState
              title="피드를 불러오지 못했어요"
              description={feed.error}
              action={<AppButton onPress={feed.retry}>다시 시도</AppButton>}
            />
          ) : (
            <EmptyState
              title="아직 게시물이 없어요"
              description="자녀가 교실에 게시물을 올리면 이곳에서 함께 확인할 수 있어요."
              action={
                <AppButton onPress={() => router.push("/(parent)/link-child")}>
                  자녀 연결하기
                </AppButton>
              }
            />
          )
        }
        ListFooterComponent={
          feed.loadingMore ? (
            <ActivityIndicator style={styles.footer} color={colors.accent} />
          ) : feed.loadMoreError ? (
            <View style={styles.footerError}>
              <Text selectable style={styles.muted}>{feed.loadMoreError}</Text>
              <AppButton variant="quiet" onPress={feed.loadMore}>다시 불러오기</AppButton>
            </View>
          ) : null
        }
      />

      <ParentBottomNav
        active="feed"
        onFeedPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { flexGrow: 1, paddingBottom: spacing.xl },
  feedTopSpacer: { height: spacing.lg },
  separator: {
    height: borders.hairline,
    marginVertical: spacing.lg,
    backgroundColor: colors.border,
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
