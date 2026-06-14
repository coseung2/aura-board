import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { colors, spacing, typography } from "../../theme/tokens";
import { CardView } from "../CardView";
import { CardDetailModal } from "../CardDetailModal";
import type { BoardDetailResponse, BoardCard } from "../../lib/types";

// 카드 추가를 아직 모바일에서 지원하지 않는 레이아웃의 공통 뷰어.
// vibe-gallery / dj-queue / event-signup / breakout / assessment / drawing.

export function ReadOnlyCardsBoard({
  data,
}: {
  data: BoardDetailResponse;
  onMutate: () => void;
}) {
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);

  return (
    <View style={styles.root}>
      <FlatList
        data={data.cards}
        keyExtractor={(c) => c.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <Pressable
            style={styles.cardWrap}
            onPress={() => setSelectedCard(item)}
          >
            <CardView card={item} />
          </Pressable>
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
  emptyEmoji: { fontSize: 72 },
  emptyTitle: { ...typography.title, color: colors.text },
  emptyMsg: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.xxl,
  },
});
