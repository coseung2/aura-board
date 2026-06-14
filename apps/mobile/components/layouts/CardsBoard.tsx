import { useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, radii, shadows, spacing, tapMin, typography } from "../../theme/tokens";
import { CardView } from "../CardView";
import { CardComposer } from "../CardComposer";
import { CardDetailModal } from "../CardDetailModal";
import type { BoardDetailResponse, BoardCard } from "../../lib/types";

// freeform / grid / stream 공용 — 2열 세로 그리드.
// freeform 의 x/y 좌표는 모바일에선 무시하고 작성순 스트림으로 보여준다
// (태블릿 가로에 카드를 드래그 재배치하는 UX 는 웹 전용).

export function CardsBoard({
  data,
  onMutate,
}: {
  data: BoardDetailResponse;
  onMutate: () => void;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [cards, setCards] = useState<BoardCard[]>(data.cards);

  function handleCreated(card: BoardCard) {
    setCards((prev) => [...prev, card]);
    onMutate();
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={cards}
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
            <Text style={styles.emptyEmoji}>✨</Text>
            <Text style={styles.emptyTitle}>첫 카드를 올려볼까요?</Text>
            <Text style={styles.emptyMsg}>아래 + 버튼으로 새 카드를 작성할 수 있어요.</Text>
          </View>
        }
      />
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => setComposerOpen(true)}
      >
        <Text style={styles.fabPlus}>＋</Text>
      </Pressable>
      <CardComposer
        visible={composerOpen}
        boardId={data.board.id}
        onClose={() => setComposerOpen(false)}
        onCreated={handleCreated}
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
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl + 80 },
  row: { gap: spacing.md },
  cardWrap: { flex: 1, marginBottom: spacing.md },
  empty: {
    alignItems: "center",
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  emptyEmoji: { fontSize: 72 },
  emptyTitle: { ...typography.title, color: colors.text },
  emptyMsg: { ...typography.body, color: colors.textMuted },
  fab: {
    position: "absolute",
    right: spacing.xxl,
    bottom: spacing.xxl,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.accent,
    minWidth: tapMin,
    minHeight: tapMin,
  },
  fabPressed: { backgroundColor: colors.accentActive },
  fabPlus: { fontSize: 36, color: "#fff", fontWeight: "300", marginTop: -4 },
});
