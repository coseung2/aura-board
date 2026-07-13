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
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError, getApiUrl } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type { MeResponse } from "../../lib/types";
import {
  BOARD_LIST_CACHE_KEY,
  readBoardCache,
  revalidateBoardCache,
} from "../../lib/board-cache";
import {
  buildMobileBoardOverview,
  filterMobileBoardRows,
  type MobileBoardFilter,
  type MobileBoardRow,
} from "../../lib/mobile-board-overview";
import {
  MobileFilterBar,
  type FilterOption,
} from "../../components/MobileBoardOverview";
import {
  AppButton,
  AppHeader,
  EmptyState,
  SurfacePressable,
} from "../../components/ui";

const FALLBACK_THUMBNAIL = "/board-type-thumbnails/card-board.png";
type StudentBoardsResponse = { boards: MeResponse["boards"] };

export default function StudentBoardsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const initialCache = readBoardCache<MeResponse["boards"]>(
    BOARD_LIST_CACHE_KEY,
  );
  const [boards, setBoards] = useState<MeResponse["boards"]>(
    () => initialCache?.data ?? [],
  );
  const [loading, setLoading] = useState(() => !initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MobileBoardFilter>("all");
  const [query, setQuery] = useState("");
  const useWidePadding = width >= layoutTokens.mobileBreakpoint;
  const overview = useMemo(() => buildMobileBoardOverview(boards), [boards]);
  const visibleRows = useMemo(
    () => filterMobileBoardRows(overview, filter, query),
    [filter, overview, query],
  );
  const filterOptions = useMemo<Array<FilterOption<MobileBoardFilter>>>(
    () => [
      { value: "all", label: "전체", count: overview.summary.total },
      { value: "lesson", label: "수업", count: overview.summary.lesson },
      { value: "play", label: "놀이", count: overview.summary.play },
    ],
    [overview.summary],
  );

  const load = useCallback(
    async (refresh = false) => {
      const cached = readBoardCache<MeResponse["boards"]>(
        BOARD_LIST_CACHE_KEY,
      );
      if (cached) {
        setBoards(cached.data);
        setLoading(false);
      } else {
        setLoading(true);
      }
      if (refresh) setRefreshing(true);

      try {
        setError(null);
        const nextBoards = await revalidateBoardCache<MeResponse["boards"]>(
          BOARD_LIST_CACHE_KEY,
          async () => {
            let response: StudentBoardsResponse;
            try {
              response = await apiFetch<StudentBoardsResponse>("/api/student/boards");
            } catch (requestError) {
              if (
                !(requestError instanceof ApiError) ||
                requestError.status !== 404
              ) {
                throw requestError;
              }
              const legacy = await apiFetch<MeResponse>("/api/student/me");
              response = { boards: legacy.boards };
            }
            return response.boards;
          },
          { force: refresh, kind: "boards" },
        );
        setBoards(nextBoards);
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
      <AppHeader title="보드" />
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
              <MobileFilterBar
                query={query}
                onQueryChange={setQuery}
                queryPlaceholder="보드 이름·유형 검색"
                options={filterOptions}
                value={filter}
                onChange={(nextFilter) => {
                  setFilter(nextFilter);
                }}
              />
              <View style={styles.resultHeader}>
                <View style={styles.resultCopy}>
                  <Text style={styles.resultTitle}>{filterTitle(filter)}</Text>
                  <Text style={styles.resultHint}>{filterHint(filter)}</Text>
                </View>
                <Text style={styles.resultCount}>{visibleRows.length}개</Text>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <BoardRow
              row={item}
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
              title={query ? "검색 결과가 없어요" : "지금 바로 할 보드가 없어요"}
              description={
                query
                  ? "검색어를 바꾸거나 전체 보드에서 확인해 보세요."
                  : "전체 탭에서 수업 자료와 지난 활동을 확인할 수 있어요."
              }
              action={
                filter !== "all" || query ? (
                  <AppButton
                    variant="secondary"
                    onPress={() => {
                      setFilter("all");
                      setQuery("");
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

function BoardRow({ row, onPress }: { row: MobileBoardRow; onPress: () => void }) {
  const { board } = row;
  return (
    <SurfacePressable
      style={styles.boardCard}
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

function filterTitle(filter: MobileBoardFilter): string {
  if (filter === "lesson") return "수업 보드";
  if (filter === "play") return "놀이 보드";
  return "전체 보드";
}

function filterHint(filter: MobileBoardFilter): string {
  if (filter === "lesson") return "수업 자료와 제출 활동을 모아서 봐요.";
  if (filter === "play") return "게임과 놀이 활동의 현재 상태를 확인해요.";
  return "참여 중인 보드를 이름과 종류로 확인해요.";
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
    paddingTop: pageChrome.directContentStartGap,
    paddingBottom: spacing.xxxl,
  },
  contentWide: { paddingHorizontal: spacing.xxl },
  headerContent: {
    gap: spacing.lg,
    paddingBottom: spacing.md,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  resultCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  resultTitle: { ...typography.section, color: colors.text },
  resultHint: { ...typography.micro, color: colors.textMuted },
  resultCount: { ...typography.badge, color: colors.accentTintedText },
  columnWrapper: {
    gap: layoutTokens.boardGridGap,
  },
  boardCard: {
    flex: 1,
    minWidth: 0,
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
