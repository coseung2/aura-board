import { FlatList, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useState } from "react";
import { colors, iconSizes, layout, spacing, typography } from "../../theme/tokens";
import { CardView } from "../CardView";
import { CardDetailModal } from "../CardDetailModal";
import type { BoardDetailResponse, BoardCard } from "../../lib/types";
import { withBoardAnonymousAuthors } from "../../lib/card-privacy";

// 카드 추가를 아직 모바일에서 지원하지 않는 레이아웃의 공통 뷰어.
// vibe-gallery / dj-queue / event-signup / breakout / assessment / drawing.

export function ReadOnlyCardsBoard({ data }: { data: BoardDetailResponse }) {
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const { width } = useWindowDimensions();
  const columnCount = width < layout.mobileBreakpoint ? 1 : 2;
  const cards = withBoardAnonymousAuthors(data.cards, data.board);

  return (
    <View style={styles.root}>
      <FlatList
        data={cards}
        key={`readonly-cards-${columnCount}`}
        keyExtractor={(c) => c.id}
        numColumns={columnCount}
        columnWrapperStyle={columnCount > 1 ? styles.row : undefined}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
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
      />
      <CardDetailModal
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.md },
  row: { gap: spacing.md },
  cardWrap: { flex: 1, marginBottom: spacing.md },
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
