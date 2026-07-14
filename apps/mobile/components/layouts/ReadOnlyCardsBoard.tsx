import { FlatList, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import {
  boardThemes,
  colors,
  iconSizes,
  normalizeBoardTheme,
  spacing,
  typography,
} from "../../theme/tokens";
import { CommentBottomSheet } from "../CommentBottomSheet";
import type { BoardDetailResponse, BoardCard } from "../../lib/types";
import { withBoardAnonymousAuthors } from "../../lib/card-privacy";
import { StreamFeedPost } from "./ColumnsBoard";

// 카드 추가를 아직 모바일에서 지원하지 않는 레이아웃의 공통 뷰어.
// vibe-gallery / dj-queue / event-signup / breakout / assessment / drawing.

export function ReadOnlyCardsBoard({ data }: { data: BoardDetailResponse }) {
  const [commentCard, setCommentCard] = useState<BoardCard | null>(null);
  const [cards, setCards] = useState<BoardCard[]>(() =>
    withBoardAnonymousAuthors(data.cards, data.board),
  );
  const boardTheme = boardThemes[normalizeBoardTheme(data.board.boardTheme)];

  useEffect(() => {
    setCards(withBoardAnonymousAuthors(data.cards, data.board));
  }, [data.cards, data.board]);

  return (
    <View style={[styles.root, { backgroundColor: boardTheme.background }]}>
      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <StreamFeedPost
            card={item}
            onOpenComments={() => setCommentCard(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
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
      <CommentBottomSheet
        cardId={commentCard?.id ?? null}
        visible={commentCard !== null}
        onClose={() => setCommentCard(null)}
        onCommentCountChange={(change) => {
          if (!commentCard) return;
          setCards((current) =>
            current.map((card) =>
              card.id === commentCard.id
                ? {
                    ...card,
                    commentCount: Math.max(
                      0,
                      (card.commentCount ?? 0) + change,
                    ),
                  }
                : card,
            ),
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  separator: { height: spacing.lg },
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
