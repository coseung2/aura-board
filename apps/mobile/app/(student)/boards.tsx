import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { layoutLabel, layoutThumbnail } from "../../theme/layout-meta";
import {
  borders,
  colors,
  layout as layoutTokens,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError, getApiUrl } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type { BoardMeta, MeResponse } from "../../lib/types";
import {
  AppButton,
  AppHeader,
  EmptyState,
  Pill,
  SurfacePressable,
} from "../../components/ui";

const FALLBACK_THUMBNAIL = "/board-type-thumbnails/card-board.png";

export default function StudentBoardsScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLandscape = width > height;
  const boardColumns = isLandscape ? 4 : 2;
  const useWidePadding = width >= layoutTokens.mobileBreakpoint;
  const horizontalPadding = useWidePadding ? spacing.xxl : spacing.xl;
  const gridWidth = Math.max(
    Math.min(width, layoutTokens.readableMaxWidth) - horizontalPadding * 2,
    0,
  );
  const boardTileSize = Math.max(
    tapMin,
    Math.floor(
      (gridWidth - layoutTokens.boardGridGap * (boardColumns - 1)) /
        boardColumns,
    ),
  );

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      setError(null);
      const response = await apiFetch<MeResponse>("/api/student/me");
      setBoards(response.boards);
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.status === 401) {
        await clearSessionToken();
        router.replace("/(student)/login");
        return;
      }
      setError("보드 목록을 불러오지 못했어요.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="보드" />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>보드를 불러오는 중…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <AppButton onPress={() => void load()}>다시 시도</AppButton>
        </View>
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.content, useWidePadding && styles.contentWide]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.accent}
            />
          }
        >
          {boards.length === 0 ? (
            <EmptyState
              title="아직 참여할 수 있는 보드가 없어요."
              description="선생님이 보드를 열어 주면 이곳에서 바로 참여할 수 있어요."
              style={styles.emptyState}
            />
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeadingCopy}>
                  <Text style={styles.sectionTitle}>참여 중인 보드</Text>
                  <Text style={styles.sectionHint}>보드를 선택해 활동을 이어가세요.</Text>
                </View>
                <Text style={styles.sectionCount}>{boards.length}개</Text>
              </View>
              <View style={styles.boardGrid}>
                {boards.map((board) => {
                  const statusLabel = boardStatusLabel(board);
                  return (
                    <SurfacePressable
                      key={board.id}
                      style={[styles.boardCard, { width: boardTileSize }]}
                      onPress={() =>
                        router.push(`/(student)/board/${board.slug}?layout=${board.layout}`)
                      }
                      accessibilityLabel={`${board.title}, ${layoutLabel(board.layout)}, ${statusLabel}`}
                      accessibilityHint="보드를 열어요"
                    >
                      <Image
                        source={{ uri: boardThumbUri(board) }}
                        style={styles.thumbnail}
                        resizeMode="cover"
                        accessible={false}
                      />
                      <View style={styles.boardBody}>
                        <Text style={styles.boardTitle} numberOfLines={1}>
                          {board.title}
                        </Text>
                        <View style={styles.boardMetaRow}>
                          <Text style={styles.boardLayout} numberOfLines={1}>
                            {layoutLabel(board.layout)}
                          </Text>
                          <Pill
                            tone={boardStatusTone(board)}
                            style={styles.boardStatusPill}
                          >
                            {statusLabel}
                          </Pill>
                        </View>
                      </View>
                    </SurfacePressable>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function boardStatusLabel(board: BoardMeta): string {
  if (board.breakout) return board.breakout.selectedSectionId ? "모둠 참여 중" : "모둠 선택 필요";
  if (board.layout === "quiz") {
    const status = board.quizzes?.[0]?.status;
    return status === "active" || status === "running" ? "진행 중" : "시작 대기";
  }
  if (board.layout === "kordle") return board.kordleStatus === "LIVE" ? "진행 중" : "시작 대기";
  if (board.layout === "speed-game") return board.speedGameStatus === "running" ? "진행 중" : board.speedGameStatus === "finished" ? "종료" : "시작 대기";
  if (board.layout === "shadow-alliance") return board.shadowAllianceStatus === "active" ? "진행 중" : board.shadowAllianceStatus === "ended" ? "종료" : "시작 대기";
  return layoutLabel(board.layout);
}

function boardStatusTone(board: BoardMeta): "accent" | "danger" | "neutral" {
  const status = boardStatusLabel(board);
  if (status === "진행 중" || status === "모둠 참여 중") return "accent";
  if (status === "종료") return "danger";
  return "neutral";
}

function boardThumbUri(board: BoardMeta): string {
  const thumbnail = board.thumbnailMode === "custom" && board.thumbnailUrl
    ? board.thumbnailUrl
    : (layoutThumbnail(board.layout) ?? FALLBACK_THUMBNAIL);
  return thumbnail.startsWith("http") ? thumbnail : getApiUrl(thumbnail);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  loadingText: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
  content: {
    width: "100%",
    maxWidth: layoutTokens.readableMaxWidth,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  contentWide: { paddingHorizontal: spacing.xxl },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  sectionHeadingCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  sectionTitle: { ...typography.section, color: colors.text },
  sectionHint: { ...typography.label, color: colors.textMuted },
  sectionCount: { ...typography.label, color: colors.accent },
  boardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    columnGap: layoutTokens.boardGridGap,
    rowGap: layoutTokens.boardGridGap,
  },
  boardCard: {
    minHeight: tapMin,
    aspectRatio: 1,
    overflow: "hidden",
  },
  thumbnail: {
    flex: 1,
    width: "100%",
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  boardBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    padding: spacing.xs,
    gap: spacing.xxs,
  },
  boardTitle: { ...typography.label, color: colors.text },
  boardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  boardLayout: { ...typography.badge, color: colors.textMuted, flex: 1 },
  boardStatusPill: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  emptyState: { width: "100%", marginTop: spacing.xs },
});
