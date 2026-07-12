import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  borders,
  boardThemes,
  colors,
  controls,
  iconSizes,
  layout,
  normalizeBoardTheme,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import { CardView } from "../CardView";
import { CompactCardRow } from "../CompactCardRow";
import { CardComposer } from "../CardComposer";
import { CardDetailModal } from "../CardDetailModal";
import {
  BoardSummaryStrip,
  MobileFilterBar,
  MobileViewToggle,
  type FilterOption,
} from "../MobileBoardOverview";
import type { BoardDetailResponse, BoardCard, Section } from "../../lib/types";
import {
  filterMobileCards,
  summarizeMobileCards,
  type MobileCardFilter,
} from "../../lib/mobile-board-overview";
import {
  withBoardAnonymousAuthor,
  withBoardAnonymousAuthors,
} from "../../lib/card-privacy";
import { Fab } from "../ui";
import { useBoardRealtime } from "../../lib/use-board-realtime";

// freeform / grid / stream 공용.
// 모바일 기본값은 카드의 전체 크기를 복제하는 갤러리가 아니라 여러 카드의
// 상태를 한 번에 비교하는 압축 목록이다. 원본 카드 표현은 보기 전환으로 유지한다.

type SectionGroup = {
  section: Section | { id: string; title: string; order: number; color: null };
  cards: BoardCard[];
};

type CardViewMode = "compact" | "gallery";

type CompactSection = {
  title: string;
  data: BoardCard[];
};

function sortCards(cards: BoardCard[]): BoardCard[] {
  return [...cards].sort((a, b) => {
    const ao = a.order ?? 0;
    const bo = b.order ?? 0;
    if (ao !== bo) return ao - bo;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

function groupCardsBySection(
  cards: BoardCard[],
  sections: Section[],
): SectionGroup[] {
  const knownIds = new Set(sections.map((s) => s.id));
  const bySection = new Map<string, BoardCard[]>();
  const unsectioned: BoardCard[] = [];

  for (const card of cards) {
    const sid = card.sectionId ?? null;
    if (sid && knownIds.has(sid)) {
      const bucket = bySection.get(sid) ?? [];
      bucket.push(card);
      bySection.set(sid, bucket);
    } else {
      unsectioned.push(card);
    }
  }

  const groups: SectionGroup[] = [];
  for (const section of sections) {
    const bucket = bySection.get(section.id);
    if (bucket && bucket.length > 0) {
      groups.push({ section, cards: sortCards(bucket) });
    }
  }
  if (unsectioned.length > 0) {
    groups.push({
      section: {
        id: "__unsectioned__",
        title: "섹션 없음",
        order: Number.MAX_SAFE_INTEGER,
        color: null,
      },
      cards: sortCards(unsectioned),
    });
  }
  return groups;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function useBoardGridMetrics(width: number) {
  const padding = layout.boardGridPadding * 2;
  const gap = layout.boardGridGap;
  const available = Math.max(0, width - padding);
  const columns = Math.max(
    1,
    Math.floor((available + gap) / (layout.boardGridMinCardWidth + gap)),
  );
  const cardWidth =
    columns === 1 ? available : (available - (columns - 1) * gap) / columns;
  return { columns, cardWidth };
}

export function CardsBoard({
  data,
  onMutate,
}: {
  data: BoardDetailResponse;
  onMutate: () => void;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [cards, setCards] = useState<BoardCard[]>(() =>
    withBoardAnonymousAuthors(sortCards(data.cards), data.board),
  );
  const { width } = useWindowDimensions();
  const [viewMode, setViewMode] = useState<CardViewMode>(() =>
    width < layout.mobileBreakpoint ? "compact" : "gallery",
  );
  const [filter, setFilter] = useState<MobileCardFilter>("all");
  const [query, setQuery] = useState("");
  const { columns, cardWidth } = useBoardGridMetrics(width);
  const boardTheme = boardThemes[normalizeBoardTheme(data.board.boardTheme)];
  const streamSectionsEnabled =
    data.board.layout === "stream" && Boolean(data.board.streamSectionsEnabled);
  const summary = useMemo(
    () => summarizeMobileCards(cards, data.sections),
    [cards, data.sections],
  );
  const filteredCards = useMemo(
    () => filterMobileCards(cards, filter, query),
    [cards, filter, query],
  );
  const sectionTitleById = useMemo(
    () => new Map(data.sections.map((section) => [section.id, section.title] as const)),
    [data.sections],
  );
  const sectionGroups = useMemo(
    () =>
      streamSectionsEnabled
        ? groupCardsBySection(filteredCards, data.sections)
        : [],
    [streamSectionsEnabled, filteredCards, data.sections],
  );
  const compactSections = useMemo<CompactSection[]>(
    () =>
      streamSectionsEnabled
        ? sectionGroups.map((group) => ({
            title: group.section.title,
            data: group.cards,
          }))
        : [{ title: "", data: sortCards(filteredCards) }],
    [filteredCards, sectionGroups, streamSectionsEnabled],
  );
  const filterOptions = useMemo<Array<FilterOption<MobileCardFilter>>>(
    () => [
      { value: "all", label: "전체", count: summary.total },
      { value: "mine", label: "내 카드", count: summary.mine },
      { value: "media", label: "미디어", count: summary.media },
      { value: "comments", label: "댓글 있음" },
    ],
    [summary],
  );

  useEffect(() => {
    setCards(withBoardAnonymousAuthors(sortCards(data.cards), data.board));
  }, [data.cards, data.board]);

  function handleCreated(card: BoardCard) {
    setCards((prev) => [...prev, withBoardAnonymousAuthor(card, data.board)]);
    onMutate();
  }

  useBoardRealtime({ slug: data.board.id, onReload: onMutate });

  const header = (
    <View style={styles.headerContent}>
      <BoardSummaryStrip
        title="보드 한눈에 보기"
        description="카드 크기보다 작성·미디어·반응 상태를 먼저 비교해요."
        metrics={[
          { label: "카드", value: summary.total },
          { label: "내 카드", value: summary.mine, tone: "accent" },
          { label: "댓글", value: summary.comments },
          {
            label: streamSectionsEnabled ? "섹션" : "좋아요",
            value: streamSectionsEnabled ? summary.sections : summary.likes,
          },
        ]}
      />
      <MobileFilterBar
        query={query}
        onQueryChange={setQuery}
        queryPlaceholder="제목·내용·작성자 검색"
        options={filterOptions}
        value={filter}
        onChange={setFilter}
        trailing={
          <MobileViewToggle
            options={[
              { value: "compact", label: "목록" },
              { value: "gallery", label: "카드" },
            ]}
            value={viewMode}
            onChange={setViewMode}
          />
        }
      />
    </View>
  );

  const emptyState = (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>✨</Text>
      <Text style={styles.emptyTitle}>
        {cards.length === 0 ? "첫 카드를 올려볼까요?" : "조건에 맞는 카드가 없어요"}
      </Text>
      <Text style={styles.emptyMsg}>
        {cards.length === 0
          ? "아래 + 버튼으로 새 카드를 작성할 수 있어요."
          : "검색어나 필터를 바꿔 보세요."}
      </Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: boardTheme.background }]}>
      {viewMode === "compact" ? (
        <SectionList
          sections={compactSections}
          keyExtractor={(card) => card.id}
          contentContainerStyle={styles.compactContent}
          ListHeaderComponent={header}
          renderSectionHeader={({ section }) =>
            section.title ? (
              <View style={styles.compactSectionHeader}>
                <Text style={styles.compactSectionTitle}>{section.title}</Text>
                <Text style={styles.compactSectionCount}>{section.data.length}개</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <CompactCardRow
              card={item}
              showSection={
                streamSectionsEnabled
                  ? null
                  : sectionTitleById.get(item.sectionId ?? "") ?? null
              }
              onPress={() => setSelectedCard(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.compactSeparator} />}
          SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
          ListEmptyComponent={emptyState}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
        />
      ) : streamSectionsEnabled ? (
        <ScrollView contentContainerStyle={styles.content}>
          {header}
          {filteredCards.length === 0
            ? emptyState
            : sectionGroups.map(({ section, cards: sectionCards }) => (
                <View
                  key={section.id}
                  style={[
                    styles.section,
                    { backgroundColor: boardTheme.surface },
                  ]}
                >
                  <View style={styles.gallerySectionHeader}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <Text style={styles.compactSectionCount}>{sectionCards.length}개</Text>
                  </View>
                  <View style={styles.sectionGrid}>
                    {chunk(sectionCards, columns).map((row, rowIndex) => (
                      <View key={rowIndex} style={styles.row}>
                        {row.map((card) => (
                          <View
                            key={card.id}
                            style={[styles.cardWrap, { width: cardWidth }]}
                          >
                            <CardView
                              card={card}
                              onPress={() => setSelectedCard(card)}
                            />
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              ))}
        </ScrollView>
      ) : (
        <FlatList
          data={filteredCards}
          key={`cards-${columns}`}
          keyExtractor={(card) => card.id}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? styles.row : undefined}
          contentContainerStyle={styles.content}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <View style={[styles.cardWrap, { width: cardWidth }]}> 
              <CardView card={item} onPress={() => setSelectedCard(item)} />
            </View>
          )}
          ListEmptyComponent={emptyState}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <Fab style={styles.fab} onPress={() => setComposerOpen(true)}>
        <Text style={styles.fabPlus}>＋</Text>
      </Fab>
      <CardComposer
        visible={composerOpen}
        boardId={data.board.id}
        onClose={() => setComposerOpen(false)}
        onCreated={handleCreated}
      />
      <CardDetailModal
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
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
  root: { flex: 1 },
  headerContent: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  compactContent: {
    padding: layout.boardGridPadding,
    paddingBottom: spacing.xxxl + controls.fab,
  },
  compactSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.transparent,
  },
  compactSectionTitle: {
    ...typography.section,
    color: colors.text,
    flex: 1,
  },
  compactSectionCount: {
    ...typography.badge,
    color: colors.accentTintedText,
  },
  compactSeparator: {
    height: spacing.sm,
  },
  sectionSeparator: {
    height: spacing.md,
  },
  content: {
    padding: layout.boardGridPadding,
    gap: layout.boardGridGap,
    paddingBottom: spacing.xxxl + controls.fab,
  },
  row: {
    flexDirection: "row",
    gap: layout.boardGridGap,
  },
  cardWrap: { marginBottom: spacing.md },
  section: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
  gallerySectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
  },
  sectionGrid: {},
  empty: {
    alignItems: "center",
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  emptyEmoji: { fontSize: iconSizes.gate },
  emptyTitle: { ...typography.title, color: colors.text },
  emptyMsg: { ...typography.body, color: colors.textMuted },
  fab: {
    right: spacing.xxl,
    bottom: spacing.xxl,
  },
  fabPlus: {
    fontSize: iconSizes.xl,
    color: colors.onAccent,
    fontWeight: "300",
    marginTop: -spacing.xs,
  },
});
