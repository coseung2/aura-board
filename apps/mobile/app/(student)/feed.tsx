import { useCallback, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { SquarePen } from "lucide-react-native";
import { ApiError, apiFetch } from "../../lib/api";
import { feedApiMessage, type FeedItem, type FeedPage } from "../../lib/feed";
import { clearSessionToken, getUnifiedLoginRoute } from "../../lib/session";
import { FeedCard } from "../../components/FeedCard";
import { FeedListSkeleton, FeedLoadMoreSkeleton } from "../../components/loading-skeletons";
import { StudentHeaderActions } from "../../components/StudentHeaderActions";
import { AppButton, AppHeader, IconButton } from "../../components/ui";
import { colors, feed, iconSizes, layout, pageChrome, radii, spacing, typography } from "../../theme/tokens";
import {
  appendStudentFeedCache,
  readStudentFeedCache,
  revalidateStudentFeedCache,
} from "../../lib/student-feed-cache";

export default function StudentFeedScreen() {
  const router = useRouter();
  const initialCache = readStudentFeedCache();
  const [items, setItems] = useState<FeedItem[]>(() => initialCache?.data.items ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(
    () => initialCache?.data.nextCursor ?? null,
  );
  const [loading, setLoading] = useState(() => !initialCache);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const loadMoreCursorRef = useRef<string | null>(null);

  const handleUnauthorized = useCallback(async () => {
    await clearSessionToken();
    router.replace(getUnifiedLoginRoute("student"));
  }, [router]);

  const loadFeed = useCallback(async (
    cursor?: string | null,
    forceRefresh = false,
  ) => {
    const append = Boolean(cursor);
    if (append && loadMoreCursorRef.current === cursor) return;
    if (append) loadMoreCursorRef.current = cursor ?? null;
    const requestId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) params.set("cursor", cursor);
      const loader = () => apiFetch<FeedPage>(`/api/student/feed?${params.toString()}`, {
        forceRefresh,
      });
      const page = append
        ? await loader()
        : await revalidateStudentFeedCache(loader, { force: forceRefresh });
      if (requestId !== requestIdRef.current) return;
      const cachedPage = append
        ? appendStudentFeedCache(page).data
        : readStudentFeedCache()?.data ?? page;
      setItems(cachedPage.items);
      setNextCursor(cachedPage.nextCursor);
    } catch (nextError) {
      if (requestId !== requestIdRef.current) return;
      if (nextError instanceof ApiError && nextError.status === 401) {
        await handleUnauthorized();
        return;
      }
      setError(feedApiMessage(nextError, "피드를 불러오지 못했어요."));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
      if (append && loadMoreCursorRef.current === cursor) {
        loadMoreCursorRef.current = null;
      }
    }
  }, [handleUnauthorized]);

  useFocusEffect(
    useCallback(() => {
      const cached = readStudentFeedCache();
      if (cached) {
        setItems(cached.data.items);
        setNextCursor(cached.data.nextCursor);
        setLoading(false);
      }
      void loadFeed();
    }, [loadFeed]),
  );

  const initialLoading = loading && items.length === 0;
  const showEmpty = !initialLoading && !error && items.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader
        title="피드"
        right={(
          <>
            <IconButton
              onPress={() => router.push("/(student)/feed/compose")}
              accessibilityLabel="게시물 작성"
            >
              <SquarePen
                size={iconSizes.md}
                color={colors.accent}
                strokeWidth={2}
                accessible={false}
              />
            </IconButton>
            <StudentHeaderActions />
          </>
        )}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.publicationId}
        renderItem={({ item }) => <FeedCard item={item} />}
        onEndReached={() => {
          if (nextCursor && !loading && !loadingMore) void loadFeed(nextCursor);
        }}
        onEndReachedThreshold={0.4}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={items.length > 0 && error ? (
          <View style={styles.inlineError} accessibilityRole="alert">
            <Text style={styles.error}>{error}</Text>
            <AppButton variant="quiet" onPress={() => void loadFeed(null, true)}>
              다시 불러오기
            </AppButton>
          </View>
        ) : null}
        refreshControl={(
          <RefreshControl
            refreshing={loading && items.length > 0}
            onRefresh={() => void loadFeed(null, true)}
            tintColor={colors.accent}
          />
        )}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            {initialLoading ? <FeedListSkeleton /> : null}
            {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
            {error ? <AppButton variant="secondary" onPress={() => void loadFeed(null, true)}>다시 시도</AppButton> : null}
            {showEmpty ? <Text style={styles.muted}>아직 게시물이 없어요.</Text> : null}
          </View>
        )}
        ListFooterComponent={loadingMore ? (
          <FeedLoadMoreSkeleton />
        ) : null}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: {
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    alignSelf: "center",
    flexGrow: 1,
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl + spacing.xl,
  },
  separator: { height: spacing.md },
  emptyState: {
    minHeight: feed.emptyStateMinHeight,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  muted: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
  inlineError: {
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.noticeErrorBg,
  },
});
