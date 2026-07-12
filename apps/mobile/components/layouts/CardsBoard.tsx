import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  ScrollView,
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
import { CardComposer } from "../CardComposer";
import { CardDetailModal } from "../CardDetailModal";
import type { BoardDetailResponse, BoardCard, Section } from "../../lib/types";
import {
  withBoardAnonymousAuthor,
  withBoardAnonymousAuthors,
} from "../../lib/card-privacy";
import { Fab } from "../ui";
import { useBoardRealtime } from "../../lib/use-board-realtime";

// freeform / grid / stream 공용 — 가로 너비에 따라 고정 폭 카드를 배치한다.
// freeform 의 x/y 좌표는 모바일에선 무시하고 작성순 그리드로 보여준다.

type SectionGroup = {
  section: Section | { id: string; title: string; order: number; color: null };
  cards: BoardCard[];
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
  const columns =
    width < layout.mobileBreakpoint
      ? 2
      : Math.min(
          4,
          Math.max(
            1,
            Math.floor((available + gap) / (layout.boardGridMinCardWidth + gap)),
          ),
        );
  const cardWidth = (available - (columns - 1) * gap) / columns;
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
  // 서버 정렬이 order asc 로 바뀌었지만 클라이언트에서 한번 더 안정화한다.
  const [cards, setCards] = useState<BoardCard[]>(() =>
    withBoardAnonymousAuthors(sortCards(data.cards), data.board),
  );
  const { width } = useWindowDimensions();
  const { columns, cardWidth } = useBoardGridMetrics(width);
  const boardTheme = boardThemes[normalizeBoardTheme(data.board.boardTheme)];
  const selectedIndex = selectedCard
    ? cards.findIndex((card) => card.id === selectedCard.id)
    : -1;

  const streamSectionsEnabled =
    data.board.layout === "stream" && Boolean(data.board.streamSectionsEnabled);

  const sectionGroups = useMemo(
    () =>
      streamSectionsEnabled ? groupCardsBySection(cards, data.sections) : [],
    [streamSectionsEnabled, cards, data.sections],
  );

  useEffect(() => {
    setCards(withBoardAnonymousAuthors(sortCards(data.cards), data.board));
  }, [data.cards, data.board]);

  function handleCreated(card: BoardCard) {
    setCards((prev) => [...prev, withBoardAnonymousAuthor(card, data.board)]);
    onMutate();
  }

  // realtime: broadcast 가 도착하면 부모에서 board 데이터를 다시 받게 한다.
  // 서버 broadcast channel key 가 board.id 기준이므로 id 로 구독한다.
  useBoardRealtime({ slug: data.board.id, onReload: onMutate });

  const emptyState = (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>✨</Text>
      <Text style={styles.emptyTitle}>첫 카드를 올려볼까요?</Text>
      <Text style={styles.emptyMsg}>
        아래 + 버튼으로 새 카드를 작성할 수 있어요.
      </Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: boardTheme.background }]}>
      {streamSectionsEnabled ? (
        <ScrollView contentContainerStyle={styles.content}>
          {cards.length === 0
            ? emptyState
            : sectionGroups.map(({ section, cards: sectionCards }) => (
                <View
                  key={section.id}
                  style={[
                    styles.section,
                    { backgroundColor: boardTheme.surface },
                  ]}
                >
                  <Text style={styles.sectionTitle}>{section.title}</Text>
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
          data={cards}
          key={`cards-${columns}`}
          keyExtractor={(c) => c.id}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? styles.row : undefined}
          contentContainerStyle={styles.content}
          renderItem={({ item }) => (
            <View style={[styles.cardWrap, { width: cardWidth }]}>
              <CardView card={item} onPress={() => setSelectedCard(item)} />
            </View>
          )}
          ListEmptyComponent={emptyState}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={40}
          windowSize={7}
          removeClippedSubviews
        />
      )}

      <Fab
        style={styles.fab}
        onPress={() => setComposerOpen(true)}
        accessibilityLabel="카드 추가"
      >
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
        hasPrevious={selectedIndex > 0}
        hasNext={selectedIndex >= 0 && selectedIndex < cards.length - 1}
        onPrevious={() => setSelectedCard(cards[selectedIndex - 1] ?? null)}
        onNext={() => setSelectedCard(cards[selectedIndex + 1] ?? null)}
        onUpdated={(c) => {
          const selectedNext =
            selectedCard?.id === c.id
              ? mergeUpdatedCard(selectedCard, c, data.board)
              : null;
          setCards((prev) =>
            prev.map((existing) =>
              existing.id === c.id
                ? mergeUpdatedCard(existing, c, data.board)
                : existing,
            ),
          );
          setSelectedCard((current) =>
            current?.id === c.id
              ? (selectedNext ?? mergeUpdatedCard(current, c, data.board))
              : current,
          );
        }}
        onDeleted={(id) => {
          setCards((prev) => prev.filter((c) => c.id !== id));
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
    fontSize: iconSizes.lg,
    color: colors.onAccent,
    fontWeight: "300",
    marginTop: -spacing.xs,
  },
});
