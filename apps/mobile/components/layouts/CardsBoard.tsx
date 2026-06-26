import { useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  colors,
  controls,
  iconSizes,
  layout,
  spacing,
  typography,
} from "../../theme/tokens";
import { CardView } from "../CardView";
import { CardComposer } from "../CardComposer";
import { CardDetailModal } from "../CardDetailModal";
import type { BoardDetailResponse, BoardCard } from "../../lib/types";
import { withBoardAnonymousAuthor, withBoardAnonymousAuthors } from "../../lib/card-privacy";
import { Fab } from "../ui";
import { useBoardRealtime } from "../../lib/use-board-realtime";

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
  // 서버 정렬이 order asc 로 바뀌었지만 클라이언트에서 한번 더 안정화한다.
  const [cards, setCards] = useState<BoardCard[]>(() =>
    withBoardAnonymousAuthors(
      [...data.cards].sort((a, b) => {
        const ao = a.order ?? 0;
        const bo = b.order ?? 0;
        if (ao !== bo) return ao - bo;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }),
      data.board,
    ),
  );
  const { width } = useWindowDimensions();
  const columnCount = width < layout.mobileBreakpoint ? 1 : 2;

  useEffect(() => {
    setCards(
      withBoardAnonymousAuthors(
        [...data.cards].sort((a, b) => {
          const ao = a.order ?? 0;
          const bo = b.order ?? 0;
          if (ao !== bo) return ao - bo;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }),
        data.board,
      ),
    );
  }, [data.cards, data.board]);

  function handleCreated(card: BoardCard) {
    setCards((prev) => [...prev, withBoardAnonymousAuthor(card, data.board)]);
    onMutate();
  }

  // realtime: broadcast 가 도착하면 부모에서 board 데이터를 다시 받게 한다.
  // 서버 broadcast channel key 가 board.id 기준이므로 id 로 구독한다.
  useBoardRealtime({ slug: data.board.id, onReload: onMutate });

  return (
    <View style={styles.root}>
      <FlatList
        data={cards}
        key={`cards-${columnCount}`}
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
            <Text style={styles.emptyEmoji}>✨</Text>
            <Text style={styles.emptyTitle}>첫 카드를 올려볼까요?</Text>
            <Text style={styles.emptyMsg}>아래 + 버튼으로 새 카드를 작성할 수 있어요.</Text>
          </View>
        }
      />
      <Fab
        style={styles.fab}
        onPress={() => setComposerOpen(true)}
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
        onUpdated={(c) => {
          const next = withBoardAnonymousAuthor(c, data.board);
          setCards((prev) =>
            prev.map((existing) => (existing.id === next.id ? next : existing)),
          );
          setSelectedCard((current) => (current?.id === next.id ? next : current));
        }}
        onDeleted={(id) => {
          setCards((prev) => prev.filter((c) => c.id !== id));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl + controls.fab },
  row: { gap: spacing.md },
  cardWrap: { flex: 1, marginBottom: spacing.md },
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
  fabPlus: { fontSize: iconSizes.xl, color: colors.onAccent, fontWeight: "300", marginTop: -spacing.xs },
});
