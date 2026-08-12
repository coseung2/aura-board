import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError, apiFetch } from "../../lib/api";
import type { FeedDraft, FeedItem, FeedPage } from "../../lib/feed";
import { clearSessionToken, getUnifiedLoginRoute } from "../../lib/session";
import { FeedCard } from "../../components/FeedCard";
import { FeedComposerModal } from "../../components/FeedComposerModal";
import { ContentTab, ContentTabs } from "../../components/NavigationTabs";
import { StudentHeaderActions } from "../../components/StudentHeaderActions";
import { AppButton, AppHeader } from "../../components/ui";
import { colors, feed, layout, pageChrome, spacing, typography } from "../../theme/tokens";

type Scope = "classroom" | "global";

function apiMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  const body = error.body;
  if (body && typeof body === "object" && "error" in body) {
    const code = (body as { error?: unknown }).error;
    if (code === "invalid_media") return "YouTube 주소 또는 미디어 정보를 확인해 주세요.";
    if (code === "invalid_payload") return "게시물 내용을 확인해 주세요.";
  }
  return fallback;
}

export default function StudentFeedScreen() {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("classroom");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerVisible, setComposerVisible] = useState(false);
  const requestIdRef = useRef(0);

  const handleUnauthorized = useCallback(async () => {
    await clearSessionToken();
    router.replace(getUnifiedLoginRoute("student"));
  }, [router]);

  const loadFeed = useCallback(async (
    nextScope: Scope,
    cursor?: string | null,
    forceRefresh = false,
  ) => {
    const append = Boolean(cursor);
    const requestId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope: nextScope, limit: "20" });
      if (cursor) params.set("cursor", cursor);
      const page = await apiFetch<FeedPage>(`/api/student/feed?${params.toString()}`, {
        forceRefresh,
      });
      if (requestId !== requestIdRef.current) return;
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
    } catch (nextError) {
      if (requestId !== requestIdRef.current) return;
      if (nextError instanceof ApiError && nextError.status === 401) {
        await handleUnauthorized();
        return;
      }
      setError(apiMessage(nextError, "피드를 불러오지 못했어요."));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void loadFeed(scope);
  }, [loadFeed, scope]);

  async function createPost(draft: FeedDraft) {
    try {
      await apiFetch("/api/student/feed", { method: "POST", json: draft });
      await loadFeed("classroom", null, true);
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.status === 401) {
        await handleUnauthorized();
        throw new Error("로그인이 만료되었어요.");
      }
      throw new Error(apiMessage(nextError, "게시물을 저장하지 못했어요."));
    }
  }

  const initialLoading = loading && items.length === 0;
  const showEmpty = !initialLoading && !error && items.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader
        title="피드"
        right={(
          <View style={styles.headerActions}>
            {scope === "classroom" ? (
              <AppButton variant="secondary" onPress={() => setComposerVisible(true)}>
                작성
              </AppButton>
            ) : null}
            <StudentHeaderActions />
          </View>
        )}
      />
      <ContentTabs accessibilityLabel="피드 범위">
        <ContentTab selected={scope === "classroom"} onPress={() => setScope("classroom")}>우리 반</ContentTab>
        <ContentTab selected={scope === "global"} onPress={() => setScope("global")}>전체</ContentTab>
      </ContentTabs>

      <FlatList
        data={items}
        keyExtractor={(item) => item.publicationId}
        renderItem={({ item }) => <FeedCard item={item} />}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={(
          <RefreshControl
            refreshing={loading && items.length > 0}
            onRefresh={() => void loadFeed(scope, null, true)}
            tintColor={colors.accent}
          />
        )}
        ListHeaderComponent={scope === "global" ? (
          <Text style={styles.scopeNote}>Aura 공식 소식을 보는 전체 피드예요.</Text>
        ) : null}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            {initialLoading ? <ActivityIndicator color={colors.accent} /> : null}
            {initialLoading ? <Text style={styles.muted}>피드를 불러오는 중…</Text> : null}
            {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
            {error ? <AppButton variant="secondary" onPress={() => void loadFeed(scope, null, true)}>다시 시도</AppButton> : null}
            {showEmpty ? <Text style={styles.muted}>{scope === "classroom" ? "아직 우리 반 게시물이 없어요." : "아직 전체 소식이 없어요."}</Text> : null}
          </View>
        )}
        ListFooterComponent={items.length && nextCursor ? (
          <View style={styles.footer}>
            <AppButton
              variant="quiet"
              loading={loadingMore}
              disabled={loadingMore}
              onPress={() => void loadFeed(scope, nextCursor)}
            >
              이전 게시물 더 보기
            </AppButton>
          </View>
        ) : null}
      />

      <FeedComposerModal
        visible={composerVisible}
        onClose={() => setComposerVisible(false)}
        onSubmit={createPost}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
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
  scopeNote: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
    paddingBottom: spacing.md,
  },
  emptyState: {
    minHeight: feed.emptyStateMinHeight,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  muted: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
  footer: { alignItems: "center", paddingTop: spacing.lg },
});
