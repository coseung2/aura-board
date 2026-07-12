import {
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useEffect, useState } from "react";
import {
  boardThemes,
  colors,
  iconSizes,
  layout,
  normalizeBoardTheme,
  spacing,
  typography,
} from "../../theme/tokens";
import { CardView } from "../CardView";
import { CardDetailModal } from "../CardDetailModal";
import type { BoardDetailResponse, BoardCard } from "../../lib/types";
import {
  withBoardAnonymousAuthor,
  withBoardAnonymousAuthors,
} from "../../lib/card-privacy";

// 카드 추가를 아직 모바일에서 지원하지 않는 레이아웃의 공통 뷰어.
// vibe-gallery / dj-queue / event-signup / breakout / assessment / drawing.

function useBoardGridMetrics(width: number, height: number) {
  const padding = layout.boardGridPadding * 2;
  const gap = layout.boardGridGap;
  const available = Math.max(0, width - padding);
  const columns = width > height ? 4 : 2;
  const cardWidth = (available - (columns - 1) * gap) / columns;
  return { columns, cardWidth };
}

export function ReadOnlyCardsBoard({ data }: { data: BoardDetailResponse }) {
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [cards, setCards] = useState<BoardCard[]>(() =>
    withBoardAnonymousAuthors(data.cards, data.board),
  );
  const { width, height } = useWindowDimensions();
  const { columns, cardWidth } = useBoardGridMetrics(width, height);
  const boardTheme = boardThemes[normalizeBoardTheme(data.board.boardTheme)];
  const selectedIndex = selectedCard
    ? cards.findIndex((card) => card.id === selectedCard.id)
    : -1;

  useEffect(() => {
    setCards(withBoardAnonymousAuthors(data.cards, data.board));
  }, [data.cards, data.board]);

  return (
    <View style={[styles.root, { backgroundColor: boardTheme.background }]}>
      <FlatList
        data={cards}
        key={`readonly-cards-${columns}`}
        keyExtractor={(c) => c.id}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <View style={[styles.cardWrap, { width: cardWidth }]}>
            <CardView card={item} onPress={() => setSelectedCard(item)} />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🗂️</Text>
            <Text style={styles.emptyTitle}>아직 비어있어요</Text>
            <Text style={styles.emptyMsg}>
              이 보드는 읽기 전용이에요. 콘텐츠가 올라오면 여기에 보여요.
            </Text>
          </View>
        }
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        removeClippedSubviews
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
          setSelectedCard((current) => (current?.id === id ? null : current));
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
  content: { padding: layout.boardGridPadding, gap: layout.boardGridGap },
  row: { gap: layout.boardGridGap },
  cardWrap: { marginBottom: spacing.md },
  empty: {
    alignItems: "center",
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  emptyEmoji: { fontSize: iconSizes.gate },
  emptyTitle: { ...typography.title, color: colors.text },
  emptyMsg: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.xxl,
  },
});
