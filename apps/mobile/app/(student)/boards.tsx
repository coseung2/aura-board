import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { layoutLabel, layoutThumbnail } from "../../theme/layout-meta";
import {
  borders,
  colors,
  layout as layoutTokens,
  media,
  pageChrome,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError, getApiUrl } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type { MeResponse } from "../../lib/types";
import {
  BOARD_LIST_CACHE_KEY,
  readBoardCache,
  revalidateBoardCache,
  STUDENT_HOME_CACHE_KEY,
} from "../../lib/board-cache";
import {
  buildMobileBoardOverview,
  filterMobileBoardRows,
  type MobileBoardFilter,
  type MobileBoardRow,
} from "../../lib/mobile-board-overview";
import {
  AppButton,
  AppHeader,
  EmptyState,
  SemanticNav,
  SemanticNavItem,
  SurfacePressable,
} from "../../components/ui";
import { StudentHeaderActions } from "../../components/StudentHeaderActions";

const FALLBACK_THUMBNAIL = "/board-type-thumbnails/card-board.png";
type StudentBoardsResponse = {
  boards: MeResponse["boards"];
  classroomName: string | null;
};
type LegacyStudentBoardsResponse = MeResponse["boards"];

function normalizeStudentBoardsResponse(
  response: StudentBoardsResponse | LegacyStudentBoardsResponse,
): StudentBoardsResponse {
  if (Array.isArray(response)) {
    return { boards: response, classroomName: null };
  }
  return response;
}

export default function StudentBoardsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const initialCache = readBoardCache<
    StudentBoardsResponse | LegacyStudentBoardsResponse
  >(BOARD_LIST_CACHE_KEY);
  const initialResponse = initialCache
    ? normalizeStudentBoardsResponse(initialCache.data)
    : null;
  const homeCache = readBoardCache<MeResponse>(STUDENT_HOME_CACHE_KEY);
  const cachedClassroomName = homeCache?.data.student.classroom?.name ?? null;
  const [boards, setBoards] = useState<MeResponse["boards"]>(
    () => initialResponse?.boards ?? [],
  );
  const [classroomName, setClassroomName] = useState<string | null>(
    () => initialResponse?.classroomName ?? null,
  );
  const [loading, setLoading] = useState(() => !initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MobileBoardFilter>("all");
  const useWidePadding = width >= layoutTokens.mobileBreakpoint;
  const horizontalPadding = useWidePadding ? spacing.xxl : spacing.lg;
  const boardGridWidth = Math.max(
    Math.min(width, layoutTokens.readableMaxWidth) - horizontalPadding * 2,
    0,
  );
  const boardCardWidth = Math.max(
    1,
    Math.floor(
      (boardGridWidth -
        layoutTokens.boardGridGap * (layoutTokens.mobileBoardColumns - 1)) /
        layoutTokens.mobileBoardColumns,
    ),
  );
  const overview = useMemo(() => buildMobileBoardOverview(boards), [boards]);
  const visibleRows = useMemo(
    () => filterMobileBoardRows(overview, filter, ""),
    [filter, overview],
  );

  const load = useCallback(
    async (refresh = false) => {
      const cached = readBoardCache<
        StudentBoardsResponse | LegacyStudentBoardsResponse
      >(BOARD_LIST_CACHE_KEY);
      const cachedResponse = cached
        ? normalizeStudentBoardsResponse(cached.data)
        : null;
      if (cached) {
        setBoards(cachedResponse!.boards);
        setClassroomName(cachedResponse!.classroomName);
        setLoading(false);
      } else {
        setLoading(true);
      }
      if (refresh) setRefreshing(true);

      try {
        setError(null);
        const nextResponse = await revalidateBoardCache<
          StudentBoardsResponse | LegacyStudentBoardsResponse
        >(
          BOARD_LIST_CACHE_KEY,
          async () => {
            try {
              return await apiFetch<StudentBoardsResponse>("/api/student/boards");
            } catch (requestError) {
              if (
                !(requestError instanceof ApiError) ||
                requestError.status !== 404
              ) {
                throw requestError;
              }
              const legacy = await apiFetch<MeResponse>("/api/student/me");
              return {
                boards: legacy.boards,
                classroomName: legacy.student.classroom?.name ?? null,
              };
            }
          },
          { force: refresh || Array.isArray(cached?.data), kind: "boards" },
        );
        const response = normalizeStudentBoardsResponse(nextResponse);
        setBoards(response.boards);
        setClassroomName(response.classroomName);
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
    },
    [router],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="보드" right={<StudentHeaderActions />} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>보드를 불러오는 중…</Text>
        </View>
      ) : error && boards.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <AppButton onPress={() => void load()}>다시 시도</AppButton>
        </View>
      ) : boards.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title="아직 참여할 수 있는 보드가 없어요."
            description="선생님이 보드를 열어 주면 이곳에서 바로 참여할 수 있어요."
          />
        </View>
      ) : (
        <FlatList
          data={visibleRows}
          keyExtractor={(row) => row.board.id}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          numColumns={layoutTokens.mobileBoardColumns}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={[
            styles.content,
            useWidePadding && styles.contentWide,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            <View style={styles.headerContent}>
              <View style={styles.boardFilterHeader}>
                <Text style={styles.boardHeaderTitle} accessibilityRole="header">
                  {classroomName ?? cachedClassroomName ?? "내 학급"}
                </Text>
                <SemanticNav
                  style={styles.filterNav}
                  accessibilityLabel="보드 필터"
                >
                  <SemanticNavItem
                    selected={filter === "all"}
                    onPress={() => setFilter("all")}
                    accessibilityLabel={`전체 보드 ${overview.summary.total}개`}
                  >
                    {`전체 ${overview.summary.total}`}
                  </SemanticNavItem>
                  <SemanticNavItem
                    selected={filter === "lesson"}
                    onPress={() => setFilter("lesson")}
                    accessibilityLabel={`수업 보드 ${overview.summary.lesson}개`}
                  >
                    {`수업 ${overview.summary.lesson}`}
                  </SemanticNavItem>
                  <SemanticNavItem
                    selected={filter === "play"}
                    onPress={() => setFilter("play")}
                    accessibilityLabel={`놀이 보드 ${overview.summary.play}개`}
                  >
                    {`놀이 ${overview.summary.play}`}
                  </SemanticNavItem>
                </SemanticNav>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <BoardRow
              row={item}
              cardWidth={boardCardWidth}
              onPress={() =>
                router.push(
                  `/(student)/board/${item.board.slug}?layout=${item.board.layout}`,
                )
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <EmptyState
              title="지금 바로 할 보드가 없어요"
              description="전체 탭에서 수업 자료와 지난 활동을 확인할 수 있어요."
              action={
                filter !== "all" ? (
                  <AppButton
                    variant="secondary"
                    onPress={() => {
                      setFilter("all");
                    }}
                  >
                    전체 보드 보기
                  </AppButton>
                ) : undefined
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function BoardRow({
  row,
  cardWidth,
  onPress,
}: {
  row: MobileBoardRow;
  cardWidth: number;
  onPress: () => void;
}) {
  const { board } = row;
  return (
    <SurfacePressable
      style={[styles.boardCard, { width: cardWidth }]}
      onPress={onPress}
      accessibilityLabel={`${board.title}, ${layoutLabel(board.layout)}`}
      accessibilityHint="보드를 열어요"
    >
      <Image
        source={{ uri: boardThumbUri(board) }}
        style={styles.thumbnail}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={`${board.id}:${board.thumbnailUrl ?? board.layout}`}
        accessible={false}
      />
      <View style={styles.boardCardBody}>
        <Text style={styles.boardTitle} numberOfLines={2}>
          {board.title}
        </Text>
        <Text style={styles.boardType} numberOfLines={1}>
          {layoutLabel(board.layout)}
        </Text>
      </View>
    </SurfacePressable>
  );
}

function boardThumbUri(board: MeResponse["boards"][number]): string {
  const thumbnail =
    board.thumbnailMode === "custom" && board.thumbnailUrl
      ? board.thumbnailUrl
      : (layoutThumbnail(board.layout) ?? FALLBACK_THUMBNAIL);
  return thumbnail.startsWith("http") ? thumbnail : getApiUrl(thumbnail);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  loadingText: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  content: {
    width: "100%",
    maxWidth: layoutTokens.readableMaxWidth,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: pageChrome.contentStartGap,
    paddingBottom: spacing.xxxl,
  },
  contentWide: { paddingHorizontal: spacing.xxl },
  headerContent: {
    paddingBottom: spacing.md,
  },
  boardFilterHeader: {
    minHeight: tapMin + spacing.xs,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  boardHeaderTitle: {
    ...typography.section,
    color: colors.text,
    flex: 1,
    minWidth: 0,
    paddingBottom: spacing.xs,
  },
  filterNav: {
    borderBottomWidth: borders.none,
    flexShrink: 0,
  },
  columnWrapper: {
    gap: layoutTokens.boardGridGap,
  },
  boardCard: {
    minWidth: 0,
    flexShrink: 0,
    overflow: "hidden",
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  thumbnail: {
    width: "100%",
    aspectRatio: media.previewAspectRatio,
    borderRadius: radii.none,
    backgroundColor: colors.surfaceAlt,
  },
  boardCardBody: {
    minWidth: 0,
    gap: spacing.xs,
    padding: spacing.md,
  },
  boardTitle: {
    ...typography.subtitle,
    color: colors.text,
  },
  boardType: {
    ...typography.micro,
    color: colors.textMuted,
  },
  separator: {
    height: spacing.sm,
  },
});
