import { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ParentBottomNav } from "../../components/parent-bottom-nav";
import { ParentFeedCard } from "../../components/parent-feed-card";
import { ParentHeaderActions } from "../../components/parent-header-actions";
import { AppButton, AppHeader, EmptyState } from "../../components/ui";
import { useParentFeed } from "../../hooks/use-parent-feed";
import { clearParentSession, loadParentToken } from "../../lib/session";
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

  const handleUnauthorized = useCallback(async () => {
    await clearParentSession();
    router.replace("/?role=parent&error=로그인이 만료되었어요. 다시 로그인해 주세요.");
  }, [router]);

  useEffect(() => {
    void loadParentToken().then((token) => {
      if (!token) {
        router.replace("/?role=parent");
      }
    });
  }, [router]);

  const feed = useParentFeed({ focusPostId, onUnauthorized: handleUnauthorized });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader
        title="피드"
        right={<ParentHeaderActions />}
      />

      <FlatList
        ref={listRef}
        data={feed.items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ParentFeedCard
            card={item}
            highlighted={Boolean(focusPostId && item.id === focusPostId)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        refreshing={feed.refreshing}
        onRefresh={feed.refresh}
        onEndReached={() => void feed.loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.intro}>
            <Text selectable style={styles.introTitle}>
              우리 아이들의 새 소식
            </Text>
            <Text selectable style={styles.introText}>
              연결된 모든 자녀의 게시물을 최신순으로 모아 보여드려요.
            </Text>
          </View>
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
  intro: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  introTitle: { ...typography.title, color: colors.text },
  introText: { ...typography.body, color: colors.textMuted },
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
