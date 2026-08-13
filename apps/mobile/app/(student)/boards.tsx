import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  InteractionManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import {
  type Href,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { BoardListSkeleton } from "../../components/loading-skeletons";
import { layoutLabel, layoutThumbnail } from "../../theme/layout-meta";
import {
  borders,
  colors,
  layout as layoutTokens,
  pageChrome,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError, getApiUrl } from "../../lib/api";
import { clearSessionToken, getUnifiedLoginRoute } from "../../lib/session";
import type { BoardDetailResponse, BoardMeta, MeResponse } from "../../lib/types";
import {
  BOARD_LIST_CACHE_KEY,
  boardDetailCacheKey,
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
  isMobileOfficialGameKind,
  MOBILE_GAME_HUB_ORDER,
} from "../../lib/game-platform-contract";
import {
  AppButton,
  AppHeader,
  EmptyState,
  ControlPressable,
} from "../../components/ui";
import {
  SectionNav,
  SectionNavItem,
} from "../../components/NavigationTabs";
import { StudentHeaderActions } from "../../components/StudentHeaderActions";
import { GameHubCatalog } from "../../components/game-platform/GameHubCatalog";
import { GameRecordsPanel } from "../../components/game-platform/GameRecordsPanel";

const FALLBACK_THUMBNAIL = "/board-type-thumbnails/card-board.png";
const BOARD_TILE_WIDE_BREAKPOINT = 700;
const BOARD_TILE_GAP = spacing.sm;
type StudentBoardsResponse = {
  boards: MeResponse["boards"];
  classroomName: string | null;
};
type LegacyStudentBoardsResponse = MeResponse["boards"];
type PlayTab = "games" | "records";

function normalizeStudentBoardsResponse(
  response: StudentBoardsResponse | LegacyStudentBoardsResponse,
): StudentBoardsResponse {
  if (Array.isArray(response)) {
    return { boards: response, classroomName: null };
  }
  return response;
}

function parseFilter(value: unknown): MobileBoardFilter {
  return value === "lesson" || value === "play" ? value : "all";
}

function parsePlayTab(value: unknown): PlayTab {
  return value === "records" ? "records" : "games";
}

export default function StudentBoardsScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<{
    filter?: string | string[];
    playTab?: string | string[];
  }>();
  const routeFilter = Array.isArray(routeParams.filter)
    ? routeParams.filter[0]
    : routeParams.filter;
  const routePlayTab = Array.isArray(routeParams.playTab)
    ? routeParams.playTab[0]
    : routeParams.playTab;
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
  const [filter, setFilter] = useState<MobileBoardFilter>(() =>
    parseFilter(routeFilter),
  );
  const [playTab, setPlayTab] = useState<PlayTab>(() =>
    parsePlayTab(routePlayTab),
  );
  const useWidePadding = width >= layoutTokens.mobileBreakpoint;
  const horizontalPadding = useWidePadding ? spacing.xxl : spacing.lg;
  const boardGridWidth = Math.max(
    Math.min(width, layoutTokens.readableMaxWidth) - horizontalPadding * 2,
    0,
  );
  const boardColumns =
    width >= BOARD_TILE_WIDE_BREAKPOINT
      ? 3
      : layoutTokens.mobileBoardColumns;
  const boardCardWidth = Math.max(
    1,
    Math.floor(
      (boardGridWidth - BOARD_TILE_GAP * (boardColumns - 1)) /
        boardColumns,
    ),
  );
  const contentBoards = useMemo(
    () => boards.filter((board) => !isMobileOfficialGameKind(board.layout)),
    [boards],
  );
  const overview = useMemo(
    () => buildMobileBoardOverview(contentBoards),
    [contentBoards],
  );
  const visibleRows = useMemo(
    () => filterMobileBoardRows(overview, filter === "play" ? "all" : filter, ""),
    [filter, overview],
  );

  useEffect(() => {
    if (filter === "play" || visibleRows.length === 0) return undefined;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      const candidates = visibleRows.slice(0, 4).map((row) => row.board);
      let nextIndex = 0;
      const worker = async () => {
        while (!cancelled) {
          const board = candidates[nextIndex++];
          if (!board) return;
          await prefetchBoardDetail(board).catch(() => undefined);
        }
      };
      void Promise.all([worker(), worker()]);
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [filter, visibleRows]);

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
          router.replace(getUnifiedLoginRoute("student"));
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

  function chooseFilter(next: MobileBoardFilter) {
    setFilter(next);
    router.setParams({
      filter: next === "all" ? undefined : next,
      playTab: next === "play" && playTab === "records" ? "records" : undefined,
    });
  }

  function choosePlayTab(next: PlayTab) {
    setPlayTab(next);
    router.setParams({
      filter: "play",
      playTab: next === "records" ? "records" : undefined,
    });
  }

  const filterHeader = (
    <View style={styles.headerContent}>
      <View style={styles.boardFilterHeader}>
        <Text style={styles.boardHeaderTitle} accessibilityRole="header">
          {classroomName ?? cachedClassroomName ?? "내 학급"}
        </Text>
        <SectionNav style={styles.filterNav} accessibilityLabel="보드 필터">
          <SectionNavItem
            selected={filter === "all"}
            onPress={() => chooseFilter("all")}
            accessibilityLabel={`전체 보드 ${overview.summary.total}개`}
          >
            {`전체 ${overview.summary.total}`}
          </SectionNavItem>
          <SectionNavItem
            selected={filter === "lesson"}
            onPress={() => chooseFilter("lesson")}
            accessibilityLabel={`수업 보드 ${overview.summary.lesson}개`}
          >
            {`수업 ${overview.summary.lesson}`}
          </SectionNavItem>
          <SectionNavItem
            selected={filter === "play"}
            onPress={() => chooseFilter("play")}
            accessibilityLabel={`놀이 게임 ${MOBILE_GAME_HUB_ORDER.length}개`}
          >
            {`놀이 ${MOBILE_GAME_HUB_ORDER.length}`}
          </SectionNavItem>
        </SectionNav>
      </View>
      {filter === "play" ? (
        <SectionNav
          style={styles.playNav}
          accessibilityLabel="놀이 보기"
        >
          <SectionNavItem
            selected={playTab === "games"}
            onPress={() => choosePlayTab("games")}
          >
            게임
          </SectionNavItem>
          <SectionNavItem
            selected={playTab === "records"}
            onPress={() => choosePlayTab("records")}
          >
            나의 전적
          </SectionNavItem>
        </SectionNav>
      ) : null}
    </View>
  );

  if (filter === "play") {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <AppHeader title="보드" right={<StudentHeaderActions />} />
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
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
        >
          {filterHeader}
          {playTab === "games" ? <GameHubCatalog /> : <GameRecordsPanel />}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="보드" right={<StudentHeaderActions />} />
      {loading && contentBoards.length === 0 ? (
        <View style={styles.screenBody}>
          {filterHeader}
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.content}
            scrollEnabled={false}
          >
            <BoardListSkeleton />
          </ScrollView>
        </View>
      ) : error && contentBoards.length === 0 ? (
        <View style={styles.screenBody}>
          {filterHeader}
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <AppButton onPress={() => void load()}>다시 시도</AppButton>
          </View>
        </View>
      ) : contentBoards.length === 0 ? (
        <View style={styles.screenBody}>
          {filterHeader}
          <View style={styles.emptyWrap}>
            <EmptyState
              title="아직 참여할 수 있는 수업 보드가 없어요."
              description="놀이 탭의 다섯 게임은 보드와 관계없이 언제든 확인할 수 있어요."
              action={
                <AppButton onPress={() => chooseFilter("play")}>
                  놀이 게임 보기
                </AppButton>
              }
            />
          </View>
        </View>
      ) : (
        <FlatList
          key={`board-tiles-${boardColumns}`}
          data={visibleRows}
          keyExtractor={(row) => row.board.id}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          numColumns={boardColumns}
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
          ListHeaderComponent={filterHeader}
          renderItem={({ item }) => (
            <BoardRow
              row={item}
              cardWidth={boardCardWidth}
              onPressIn={() => void prefetchBoardDetail(item.board)}
              onPress={() =>
                router.push(
                  `/(student)/board/${item.board.slug}?layout=${item.board.layout}` as Href,
                )
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <EmptyState
              title="이 조건의 수업 보드가 없어요"
              description="전체 탭에서 다른 수업 자료를 확인하거나 놀이 탭에서 게임을 시작해 보세요."
              action={
                <AppButton
                  variant="secondary"
                  onPress={() => chooseFilter("all")}
                >
                  전체 보드 보기
                </AppButton>
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
  onPressIn,
  onPress,
}: {
  row: MobileBoardRow;
  cardWidth: number;
  onPressIn: () => void;
  onPress: () => void;
}) {
  const { board } = row;
  return (
    <ControlPressable
      style={[styles.boardCard, { width: cardWidth }]}
      onPressIn={onPressIn}
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
        <Text style={styles.boardTitle} numberOfLines={1}>
          {board.title}
        </Text>
        <Text style={styles.boardType} numberOfLines={1}>
          {layoutLabel(board.layout)}
        </Text>
      </View>
    </ControlPressable>
  );
}

function prefetchBoardDetail(board: BoardMeta): Promise<BoardDetailResponse> {
  const key = boardDetailCacheKey(board.slug);
  return revalidateBoardCache<BoardDetailResponse>(
    key,
    () =>
      apiFetch<BoardDetailResponse>(
        `/api/student/board/${encodeURIComponent(board.slug)}`,
      ),
    { kind: "detail" },
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
  screenBody: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: pageChrome.contentStartGap },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
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
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  boardFilterHeader: {
    minHeight: tapMin,
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
  playNav: {
    alignSelf: "flex-start",
  },
  columnWrapper: {
    gap: BOARD_TILE_GAP,
  },
  boardCard: {
    position: "relative",
    minWidth: 0,
    flexShrink: 0,
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.none,
    overflow: "visible",
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: spacing.sm,
  },
  thumbnail: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radii.none,
    backgroundColor: colors.surfaceAlt,
  },
  boardCardBody: {
    minWidth: 0,
    gap: spacing.xxs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  boardTitle: {
    ...typography.label,
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
