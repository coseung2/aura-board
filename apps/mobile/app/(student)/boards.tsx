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
  radii,
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
  SemanticNav,
  SemanticNavItem,
  SurfacePressable,
} from "../../components/ui";

const FALLBACK_THUMBNAIL = "/board-type-thumbnails/card-board.png";
const BOARD_CATEGORIES = [
  { key: "LESSON", label: "수업" },
  { key: "PLAY", label: "놀이" },
] as const;
type BoardCategory = (typeof BOARD_CATEGORIES)[number]["key"];
type StudentBoardsResponse = { boards: BoardMeta[] };

export default function StudentBoardsScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<BoardCategory | null>(
    null,
  );
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
  const lessonBoards = boards.filter(
    (board) => boardCategory(board) === "LESSON",
  );
  const playBoards = boards.filter((board) => boardCategory(board) === "PLAY");
  const activeCategory: BoardCategory =
    selectedCategory ?? (lessonBoards.length > 0 ? "LESSON" : "PLAY");
  const activeBoards = activeCategory === "LESSON" ? lessonBoards : playBoards;
  const activeCategoryLabel =
    BOARD_CATEGORIES.find((category) => category.key === activeCategory)?.label ??
    "보드";

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      setError(null);
      let response: StudentBoardsResponse;
      try {
        response = await apiFetch<StudentBoardsResponse>("/api/student/boards");
      } catch (requestError) {
        // 기존 원격 서버가 경량 목록 라우트보다 먼저 배포된 앱을 지원한다.
        // 로컬/최신 서버에서는 위의 전용 API를 사용하고, 아직 경로가 없는
        // 원격 서버에서만 기존 홈 payload의 boards로 안전하게 되돌아간다.
        if (!(requestError instanceof ApiError) || requestError.status !== 404) {
          throw requestError;
        }
        const legacy = await apiFetch<MeResponse>("/api/student/me");
        response = { boards: legacy.boards };
      }
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

  const categoryTabs = boards.length > 0 ? (
    <SemanticNav
      style={styles.categoryTabs}
      accessibilityLabel="보드 구분"
    >
      {BOARD_CATEGORIES.map((category) => {
        const isActive = activeCategory === category.key;
        return (
          <SemanticNavItem
            key={category.key}
            onPress={() => setSelectedCategory(category.key)}
            accessibilityLabel={`${category.label} 보드`}
            selected={isActive}
          >
            {category.label}
          </SemanticNavItem>
        );
      })}
    </SemanticNav>
  ) : null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader
        title="보드"
        right={categoryTabs}
        rightStyle={styles.categoryTabsRight}
      />
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
              {activeBoards.length === 0 ? (
                <EmptyState
                  title={`${activeCategoryLabel} 보드가 없어요.`}
                  description="다른 구분을 선택하거나 선생님이 보드를 열어 주면 이곳에 표시돼요."
                  style={styles.categoryEmptyState}
                />
              ) : (
                <View style={styles.boardGrid}>
                  {activeBoards.map((board) => {
                    const statusLabel = boardStatusLabel(board);
                    const layout = layoutLabel(board.layout);
                    const statusIsDistinct = statusLabel !== layout;
                    return (
                      <SurfacePressable
                        key={board.id}
                        style={[styles.boardCard, { width: boardTileSize }]}
                        onPress={() =>
                          router.push(`/(student)/board/${board.slug}?layout=${board.layout}`)
                        }
                        accessibilityLabel={`${board.title}, ${layout}, ${statusLabel}`}
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
                              {layout}
                            </Text>
                            {statusIsDistinct ? (
                              <Text
                                style={[
                                  styles.boardStatus,
                                  boardStatusTone(board) === "accent" && styles.boardStatusAccent,
                                  boardStatusTone(board) === "danger" && styles.boardStatusDanger,
                                ]}
                                numberOfLines={1}
                              >
                                {statusLabel}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </SurfacePressable>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** Keep a malformed/new category visible under the schema's safe default. */
function boardCategory(board: BoardMeta): BoardCategory {
  return board.category === "PLAY" ? "PLAY" : "LESSON";
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
  categoryTabs: {
    alignSelf: "stretch",
    height: "100%",
  },
  categoryTabsRight: {
    alignSelf: "stretch",
    marginBottom: -borders.hairline,
  },
  categoryEmptyState: { width: "100%", marginTop: spacing.xs },
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
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
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
  boardStatus: { ...typography.badge, color: colors.textMuted, flexShrink: 1 },
  boardStatusAccent: { color: colors.accentTintedText },
  boardStatusDanger: { color: colors.danger },
  emptyState: { width: "100%", marginTop: spacing.xs },
});
