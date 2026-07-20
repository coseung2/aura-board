import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import {
  colors,
  controls,
  iconSizes,
  spacing,
  typography,
} from "../../theme/tokens";
import { CardComposer } from "../CardComposer";
import { CardAuthorBottomSheet } from "../CardAuthorBottomSheet";
import { CommentBottomSheet } from "../CommentBottomSheet";
import type { BoardDetailResponse, BoardCard } from "../../lib/types";
import {
  withBoardAnonymousAuthor,
  withBoardAnonymousAuthors,
} from "../../lib/card-privacy";
import { Fab } from "../ui";
import { useBoardRealtime } from "../../lib/use-board-realtime";
import { StreamFeedPost } from "./ColumnsBoard";
import {
  nextCardOrder,
  sortCards,
  updateCardCommentCount,
} from "./cards-board-utils";

// freeform / grid / stream 공용 — 모바일에서는 세로 피드로 일관되게 보여준다.

export function CardsBoard({
  data,
  onMutate,
}: {
  data: BoardDetailResponse;
  onMutate: () => void;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [commentCard, setCommentCard] = useState<BoardCard | null>(null);
  const [authorCard, setAuthorCard] = useState<BoardCard | null>(null);
  // 서버 정렬이 order asc 로 바뀌었지만 클라이언트에서 한번 더 안정화한다.
  const [cards, setCards] = useState<BoardCard[]>(() =>
    withBoardAnonymousAuthors(sortCards(data.cards), data.board),
  );
  useEffect(() => {
    setCards(withBoardAnonymousAuthors(sortCards(data.cards), data.board));
  }, [data.cards, data.board]);

  function handleCreated(card: BoardCard) {
    setCards((prev) =>
      sortCards([...prev, withBoardAnonymousAuthor(card, data.board)]),
    );
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
    <View style={styles.root}>
      <FlatList
        data={cards}
        keyExtractor={(card) => card.id}
        contentContainerStyle={styles.streamContent}
        renderItem={({ item }) => (
          <StreamFeedPost
            card={item}
            onOpenComments={() => setCommentCard(item)}
            onOpenAuthorPicker={
              item.canEdit === true ? () => setAuthorCard(item) : undefined
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.streamSeparator} />}
        ListEmptyComponent={emptyState}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        removeClippedSubviews
      />

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
        order={nextCardOrder(cards)}
        onClose={() => setComposerOpen(false)}
        onCreated={handleCreated}
      />
      <CommentBottomSheet
        cardId={commentCard?.id ?? null}
        visible={commentCard !== null}
        onClose={() => setCommentCard(null)}
        onCommentCountChange={(change) => {
          if (!commentCard) return;
          setCards((current) =>
            updateCardCommentCount(current, commentCard.id, change),
          );
        }}
      />
      <CardAuthorBottomSheet
        cardId={authorCard?.id ?? null}
        classroomId={
          data.board.classroomId ?? data.currentStudent?.classroomId ?? null
        }
        initialAuthors={authorCard?.authors ?? []}
        visible={authorCard !== null}
        onClose={() => setAuthorCard(null)}
        onSaved={(authors) => {
          if (!authorCard) return;
          setCards((current) =>
            current.map((card) =>
              card.id === authorCard.id
                ? {
                    ...card,
                    authors: authors.map((author, index) => ({
                      id: `${card.id}:author:${index}`,
                      studentId: author.studentId,
                      displayName: author.displayName,
                    })),
                    studentAuthorId: authors[0]?.studentId ?? null,
                    studentAuthorName: authors[0]?.displayName ?? null,
                    externalAuthorName: authors[0]?.displayName ?? null,
                  }
                : card,
            ),
          );
          onMutate();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  streamContent: {
    paddingHorizontal: spacing.none,
    paddingBottom: spacing.xxxl + controls.fab,
  },
  streamSeparator: {
    height: spacing.lg,
  },
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
