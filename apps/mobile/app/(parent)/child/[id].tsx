import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { clearParentSession } from "../../../lib/session";
import type { PortfolioCardDTO } from "../../../lib/types";
import { useParentFeed } from "../../../hooks/use-parent-feed";
import { CardDetailModal } from "../../../components/CardDetailModal";
import {
  ParentFeedCard,
  toParentFeedBoardCard,
} from "../../../components/parent-feed-card";
import { AppButton, AppHeader, EmptyState } from "../../../components/ui";
import {
  colors,
  iconSizes,
  parent,
  radii,
  spacing,
  typography,
} from "../../../theme/tokens";

export default function ChildDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const childId = typeof id === "string" && id ? id : null;
  const [openCard, setOpenCard] = useState<PortfolioCardDTO | null>(null);

  const handleUnauthorized = useCallback(async () => {
    await clearParentSession();
    router.replace(
      "/(parent)/login?error=로그인이 만료되었어요. 다시 로그인해 주세요.",
    );
  }, [router]);

  const feed = useParentFeed({ childId, onUnauthorized: handleUnauthorized });
  const modalCard = useMemo(
    () =>
      openCard
        ? toParentFeedBoardCard(openCard, feed.child?.name ?? "자녀")
        : null,
    [feed.child?.name, openCard],
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <AppHeader
        title={feed.child ? `${feed.child.name} 피드` : "자녀 피드"}
        onBack={() => router.back()}
      />
      <FlatList
        data={feed.items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ParentFeedCard
            card={item}
            childName={feed.child?.name ?? "자녀"}
            onOpen={setOpenCard}
          />
        )}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.listContent}
        refreshing={feed.refreshing}
        onRefresh={feed.refresh}
        onEndReached={() => void feed.loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          feed.child ? (
            <View style={styles.profile}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{feed.child.name.slice(0, 1)}</Text>
              </View>
              <View style={styles.profileCopy}>
                <Text selectable style={styles.profileName}>
                  {feed.child.name}의 새 소식
                </Text>
                <Text selectable style={styles.profileMeta}>
                  {feed.child.classroomName}
                  {feed.child.number != null ? ` · ${feed.child.number}번` : ""}
                </Text>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          feed.loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text selectable style={styles.mutedText}>
                게시물을 불러오는 중이에요.
              </Text>
            </View>
          ) : !childId ? (
            <EmptyState
              icon={<Text style={styles.emptyEmoji}>!</Text>}
              title="자녀 정보를 찾을 수 없어요"
              action={<AppButton onPress={() => router.back()}>돌아가기</AppButton>}
            />
          ) : feed.error ? (
            <EmptyState
              icon={<Text style={styles.emptyEmoji}>🔒</Text>}
              title="피드를 확인할 수 없어요"
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
      <CardDetailModal card={modalCard} onClose={() => setOpenCard(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  avatar: {
    width: parent.childDetailAvatarSize,
    height: parent.childDetailAvatarSize,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentTintedBg,
  },
  avatarText: { ...typography.title, color: colors.accentTintedText },
  profileCopy: { flex: 1, gap: spacing.xs },
  profileName: { ...typography.title, color: colors.text },
  profileMeta: { ...typography.body, color: colors.textMuted },
  center: {
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
