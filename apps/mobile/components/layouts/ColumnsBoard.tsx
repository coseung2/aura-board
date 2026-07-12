import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  boardThemes,
  colors,
  controls,
  iconSizes,
  media,
  normalizeBoardTheme,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import { CompactCardRow } from "../CompactCardRow";
import { CardComposer } from "../CardComposer";
import { CardDetailModal } from "../CardDetailModal";
import {
  BoardSummaryStrip,
  MobileFilterBar,
  type FilterOption,
} from "../MobileBoardOverview";
import type { BoardDetailResponse, BoardCard } from "../../lib/types";
import {
  buildMobileSectionSummaries,
  filterMobileCards,
  summarizeMobileCards,
  type MobileCardFilter,
  type MobileSectionSummary,
} from "../../lib/mobile-board-overview";
import {
  withBoardAnonymousAuthor,
  withBoardAnonymousAuthors,
} from "../../lib/card-privacy";
import {
  AppButton,
  ControlPressable,
  Pill,
  SurfaceCard,
  SurfacePressable,
} from "../ui";
import { useBoardRealtime } from "../../lib/use-board-realtime";

type SectionFilter = "all" | "with-cards" | "mine";

const UNSECTIONED_KEY = "__unsectioned__";

function sectionKey(sectionId: string | null): string {
  return sectionId ?? UNSECTIONED_KEY;
}

export function ColumnsBoard({
  data,
  onMutate,
  writableSectionIds,
}: {
  data: BoardDetailResponse;
  onMutate: () => void;
  writableSectionIds?: string[];
}) {
  const [cards, setCards] = useState<BoardCard[]>(() =>
    withBoardAnonymousAuthors(data.cards, data.board),
  );
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(
    null,
  );
  const [composerSectionId, setComposerSectionId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>("all");
  const [cardFilter, setCardFilter] = useState<MobileCardFilter>("all");
  const [query, setQuery] = useState("");
  const { width, height } = useWindowDimensions();
  const boardTheme = boardThemes[normalizeBoardTheme(data.board.boardTheme)];
  const writableSections = useMemo(
    () =>
      writableSectionIds === undefined ? null : new Set(writableSectionIds),
    [writableSectionIds],
  );

  useEffect(() => {
    setCards(
      withBoardAnonymousAuthors(
        [...data.cards].sort((a, b) => {
          const ao = a.order ?? 0;
          const bo = b.order ?? 0;
          if (ao !== bo) return ao - bo;
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        }),
        data.board,
      ),
    );
  }, [data.cards, data.board]);

  const summaries = useMemo(
    () => buildMobileSectionSummaries(cards, data.sections),
    [cards, data.sections],
  );
  const boardSummary = useMemo(
    () => summarizeMobileCards(cards, data.sections),
    [cards, data.sections],
  );
  const selectedSummary = useMemo(
    () =>
      selectedSectionKey === null
        ? null
        : (summaries.find(
            (summary) => sectionKey(summary.id) === selectedSectionKey,
          ) ?? null),
    [selectedSectionKey, summaries],
  );
  const selectedCards = useMemo(() => {
    if (!selectedSummary) return [];
    const source = cards.filter((card) =>
      selectedSummary.id === null
        ? !card.sectionId
        : card.sectionId === selectedSummary.id,
    );
    return filterMobileCards(source, cardFilter, query);
  }, [cardFilter, cards, query, selectedSummary]);
  const visibleSummaries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko");
    return summaries.filter((summary) => {
      if (sectionFilter === "with-cards" && summary.cardCount === 0) return false;
      if (sectionFilter === "mine" && summary.mineCount === 0) return false;
      if (!normalized) return true;
      return [
        summary.title,
        summary.latestCard?.title ?? "",
        summary.latestCard?.content ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("ko")
        .includes(normalized);
    });
  }, [query, sectionFilter, summaries]);
  const sectionFilterOptions = useMemo<Array<FilterOption<SectionFilter>>>(
    () => [
      { value: "all", label: "전체", count: summaries.length },
      {
        value: "with-cards",
        label: "카드 있음",
        count: summaries.filter((summary) => summary.cardCount > 0).length,
      },
      {
        value: "mine",
        label: "내 카드 있음",
        count: summaries.filter((summary) => summary.mineCount > 0).length,
      },
    ],
    [summaries],
  );
  const selectedCardSummary = useMemo(
    () =>
      summarizeMobileCards(
        selectedSummary
          ? cards.filter((card) =>
              selectedSummary.id === null
                ? !card.sectionId
                : card.sectionId === selectedSummary.id,
            )
          : [],
        [],
      ),
    [cards, selectedSummary],
  );
  const cardFilterOptions = useMemo<Array<FilterOption<MobileCardFilter>>>(
    () => [
      { value: "all", label: "전체", count: selectedCardSummary.total },
      { value: "mine", label: "내 카드", count: selectedCardSummary.mine },
      { value: "media", label: "미디어", count: selectedCardSummary.media },
      { value: "comments", label: "댓글 있음" },
    ],
    [selectedCardSummary],
  );
  const tileMetrics = useMemo(
    () => sectionGridMetrics(width, height),
    [height, width],
  );
  const selectedIndex = selectedCard
    ? cards.findIndex((card) => card.id === selectedCard.id)
    : -1;

  useEffect(() => {
    if (
      selectedSectionKey !== null &&
      !summaries.some(
        (summary) => sectionKey(summary.id) === selectedSectionKey,
      )
    ) {
      setSelectedSectionKey(null);
    }
  }, [selectedSectionKey, summaries]);

  function handleCreated(card: BoardCard) {
    setCards((prev) => [...prev, withBoardAnonymousAuthor(card, data.board)]);
    onMutate();
  }

  function openComposer(sectionId: string | null) {
    setComposerSectionId(sectionId);
    setComposerOpen(true);
  }

  function selectSection(sectionId: string | null) {
    setSelectedSectionKey(sectionKey(sectionId));
    setCardFilter("all");
    setQuery("");
  }

  useBoardRealtime({ slug: data.board.id, onReload: onMutate });

  const canWriteSelected =
    selectedSummary?.id !== null &&
    selectedSummary?.id !== undefined &&
    (writableSections === null || writableSections.has(selectedSummary.id));

  return (
    <View style={[styles.root, { backgroundColor: boardTheme.background }]}>
      {selectedSummary ? (
        <FlatList
          data={selectedCards}
          keyExtractor={(card) => card.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.detailHeaderContent}>
              <View style={styles.detailTopRow}>
                <ControlPressable
                  style={styles.backToOverview}
                  onPress={() => {
                    setSelectedSectionKey(null);
                    setQuery("");
                  }}
                  accessibilityLabel="전체 주제 보기"
                >
                  <Text style={styles.backToOverviewText}>← 전체 주제</Text>
                </ControlPressable>
                {canWriteSelected ? (
                  <AppButton
                    variant="secondary"
                    style={styles.addButton}
                    textStyle={styles.addButtonText}
                    onPress={() => openComposer(selectedSummary.id)}
                  >
                    + 카드 추가
                  </AppButton>
                ) : null}
              </View>
              <BoardSummaryStrip
                title={selectedSummary.title}
                description="선택한 주제의 카드와 반응을 압축 목록으로 확인해요."
                metrics={[
                  { label: "카드", value: selectedCardSummary.total },
                  {
                    label: "내 카드",
                    value: selectedCardSummary.mine,
                    tone: "accent",
                  },
                  { label: "댓글", value: selectedCardSummary.comments },
                  { label: "좋아요", value: selectedCardSummary.likes },
                ]}
              />
              <MobileFilterBar
                query={query}
                onQueryChange={setQuery}
                queryPlaceholder="이 주제에서 카드 검색"
                options={cardFilterOptions}
                value={cardFilter}
                onChange={setCardFilter}
              />
            </View>
          }
          renderItem={({ item }) => (
            <CompactCardRow
              card={item}
              onPress={() => setSelectedCard(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
          ListEmptyComponent={
            <SurfaceCard style={styles.emptyDetail}>
              <Text style={styles.emptyEmoji}>📝</Text>
              <Text style={styles.emptyTitle}>
                {selectedCardSummary.total === 0
                  ? "아직 카드가 없어요"
                  : "조건에 맞는 카드가 없어요"}
              </Text>
              <Text style={styles.emptyMessage}>
                {canWriteSelected
                  ? "카드를 추가하거나 필터를 바꿔 보세요."
                  : "필터나 검색어를 바꿔 보세요."}
              </Text>
            </SurfaceCard>
          }
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        <FlatList
          data={visibleSummaries}
          key={`section-overview-${tileMetrics.columns}`}
          keyExtractor={(summary) => sectionKey(summary.id)}
          numColumns={tileMetrics.columns}
          columnWrapperStyle={
            tileMetrics.columns > 1 ? styles.overviewRow : undefined
          }
          contentContainerStyle={styles.overviewContent}
          ListHeaderComponent={
            <View style={styles.overviewHeaderContent}>
              <BoardSummaryStrip
                title="주제 한눈에 보기"
                description="가로 칼럼을 넘기지 않고 모든 주제의 카드 수와 최근 활동을 비교해요."
                metrics={[
                  { label: "주제", value: summaries.length },
                  { label: "카드", value: boardSummary.total },
                  {
                    label: "내 카드",
                    value: boardSummary.mine,
                    tone: "accent",
                  },
                  { label: "댓글", value: boardSummary.comments },
                ]}
              />
              <MobileFilterBar
                query={query}
                onQueryChange={setQuery}
                queryPlaceholder="주제·최근 카드 검색"
                options={sectionFilterOptions}
                value={sectionFilter}
                onChange={setSectionFilter}
              />
            </View>
          }
          renderItem={({ item }) => (
            <SectionOverviewTile
              summary={item}
              width={tileMetrics.tileWidth}
              writable={
                item.id !== null &&
                (writableSections === null || writableSections.has(item.id))
              }
              onPress={() => selectSection(item.id)}
              onAdd={() => openComposer(item.id)}
            />
          )}
          ListEmptyComponent={
            <SurfaceCard style={styles.emptyOverview}>
              <Text style={styles.emptyEmoji}>📊</Text>
              <Text style={styles.emptyTitle}>
                {summaries.length === 0
                  ? "주제가 아직 없어요"
                  : "조건에 맞는 주제가 없어요"}
              </Text>
              <Text style={styles.emptyMessage}>
                {summaries.length === 0
                  ? "선생님이 주제를 만들면 이곳에서 전체 상태를 확인할 수 있어요."
                  : "검색어나 필터를 바꿔 보세요."}
              </Text>
            </SurfaceCard>
          }
          keyboardShouldPersistTaps="handled"
        />
      )}

      <CardComposer
        visible={composerOpen}
        boardId={data.board.id}
        sectionId={composerSectionId}
        onClose={() => setComposerOpen(false)}
        onCreated={handleCreated}
      />
      <CardDetailModal
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        hasPrevious={selectedIndex > 0}
        hasNext={selectedIndex >= 0 && selectedIndex < cards.length - 1}
        onPrevious={() => setSelectedCard(cards[selectedIndex - 1] ?? null)}
        onNext={() => setSelectedCard(cards[selectedIndex + 1] ?? null)}
        onUpdated={(card) => {
          const selectedNext =
            selectedCard?.id === card.id
              ? mergeUpdatedCard(selectedCard, card, data.board)
              : null;
          setCards((prev) =>
            prev.map((existing) =>
              existing.id === card.id
                ? mergeUpdatedCard(existing, card, data.board)
                : existing,
            ),
          );
          setSelectedCard((current) =>
            current?.id === card.id
              ? (selectedNext ?? mergeUpdatedCard(current, card, data.board))
              : current,
          );
        }}
        onDeleted={(id) => {
          setCards((prev) => prev.filter((card) => card.id !== id));
        }}
      />
    </View>
  );
}

function SectionOverviewTile({
  summary,
  width,
  writable,
  onPress,
  onAdd,
}: {
  summary: MobileSectionSummary;
  width: number;
  writable: boolean;
  onPress: () => void;
  onAdd: () => void;
}) {
  const latestTitle =
    summary.latestCard?.title.trim() ||
    summary.latestCard?.content.trim() ||
    "최근 카드 없음";

  return (
    <SurfacePressable
      style={[styles.overviewTile, { width }]}
      onPress={onPress}
      accessibilityLabel={`${summary.title}, 카드 ${summary.cardCount}개, 댓글 ${summary.commentCount}개`}
      accessibilityHint="주제 카드를 열어요"
    >
      <View style={styles.tileHeader}>
        <Text style={styles.tileTitle} numberOfLines={2}>
          {summary.title}
        </Text>
        <Pill tone={summary.cardCount > 0 ? "accent" : "neutral"}>
          {summary.cardCount}
        </Pill>
      </View>
      <Text style={styles.tileLatest} numberOfLines={2}>
        {latestTitle}
      </Text>
      <View style={styles.tileSignals}>
        <Text style={styles.tileSignal}>내 카드 {summary.mineCount}</Text>
        <Text style={styles.tileSignal}>♡ {summary.likeCount}</Text>
        <Text style={styles.tileSignal}>💬 {summary.commentCount}</Text>
      </View>
      <View style={styles.tileFooter}>
        <Text style={styles.tileOpen}>카드 보기 →</Text>
        {writable ? (
          <ControlPressable
            style={styles.tileAdd}
            onPress={(event) => {
              event.stopPropagation();
              onAdd();
            }}
            accessibilityLabel={`${summary.title}에 카드 추가`}
          >
            <Text style={styles.tileAddText}>＋</Text>
          </ControlPressable>
        ) : null}
      </View>
    </SurfacePressable>
  );
}

function sectionGridMetrics(width: number, height: number) {
  const horizontalPadding = spacing.lg * 2;
  const available = Math.max(0, width - horizontalPadding);
  const gap = spacing.md;
  const minTileWidth = media.previewThumb * 2 + spacing.lg;
  const orientationColumns = width > height ? 4 : 2;
  const columns = Math.max(
    1,
    Math.min(
      orientationColumns,
      Math.floor((available + gap) / (minTileWidth + gap)),
    ),
  );
  return {
    columns,
    tileWidth:
      columns === 1
        ? available
        : (available - gap * (columns - 1)) / columns,
  };
}

function mergeUpdatedCard(
  existing: BoardCard,
  updated: BoardCard,
  board: BoardDetailResponse["board"],
): BoardCard {
  return withBoardAnonymousAuthor(
    {
      ...existing,
      ...updated,
      isMine: existing.isMine,
      canEdit: existing.canEdit,
      canDelete: existing.canDelete,
      isOwnPendingQueue: existing.isOwnPendingQueue,
    },
    board,
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overviewContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  overviewHeaderContent: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  overviewRow: {
    gap: spacing.md,
  },
  overviewTile: {
    minHeight: media.previewThumb * 2,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
    borderRadius: radii.card,
  },
  tileHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  tileTitle: {
    ...typography.section,
    color: colors.text,
    flex: 1,
  },
  tileLatest: {
    ...typography.micro,
    color: colors.textMuted,
    flex: 1,
  },
  tileSignals: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tileSignal: {
    ...typography.micro,
    color: colors.textFaint,
  },
  tileFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  tileOpen: {
    ...typography.micro,
    color: colors.accentTintedText,
  },
  tileAdd: {
    minHeight: controls.closeButton,
    minWidth: controls.closeButton,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: colors.accentTintedBg,
  },
  tileAddText: {
    ...typography.subtitle,
    color: colors.accentTintedText,
  },
  emptyOverview: {
    flex: 1,
    alignItems: "center",
    padding: spacing.xxl,
    gap: spacing.md,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  detailHeaderContent: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  detailTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  backToOverview: {
    flex: 1,
    borderColor: colors.transparent,
    backgroundColor: colors.transparent,
    paddingHorizontal: spacing.sm,
  },
  backToOverviewText: {
    ...typography.label,
    color: colors.accentTintedText,
  },
  addButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addButtonText: {
    ...typography.badge,
  },
  listSeparator: {
    height: spacing.sm,
  },
  emptyDetail: {
    alignItems: "center",
    padding: spacing.xxl,
    gap: spacing.md,
  },
  emptyEmoji: {
    fontSize: iconSizes.empty,
  },
  emptyTitle: {
    ...typography.title,
    color: colors.text,
    textAlign: "center",
  },
  emptyMessage: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
});
