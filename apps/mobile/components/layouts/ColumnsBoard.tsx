import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  borders,
  colors,
  columns as columnTokens,
  iconSizes,
  spacing,
  typography,
} from "../../theme/tokens";
import { CardView } from "../CardView";
import { CardComposer } from "../CardComposer";
import { CardDetailModal } from "../CardDetailModal";
import type { BoardDetailResponse, BoardCard } from "../../lib/types";
import { withBoardAnonymousAuthor, withBoardAnonymousAuthors } from "../../lib/card-privacy";
import { AppButton, Pill, SurfaceCard } from "../ui";

export function ColumnsBoard({
  data,
  onMutate,
}: {
  data: BoardDetailResponse;
  onMutate: () => void;
}) {
  const [cards, setCards] = useState<BoardCard[]>(() =>
    withBoardAnonymousAuthors(data.cards, data.board),
  );
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    setCards(withBoardAnonymousAuthors(data.cards, data.board));
  }, [data.cards, data.board]);

  const columns = useMemo(() => {
    const map = new Map<string | null, { title: string; cards: BoardCard[] }>();
    for (const section of data.sections) {
      map.set(section.id, { title: section.title, cards: [] });
    }
    map.set(null, { title: "기타", cards: [] });

    for (const card of cards) {
      const target = map.get(card.sectionId) ?? map.get(null);
      if (target) target.cards.push(card);
    }

    const ordered: Array<{ id: string | null; title: string; cards: BoardCard[] }> = [];
    for (const section of data.sections) {
      const entry = map.get(section.id);
      if (entry) ordered.push({ id: section.id, title: entry.title, cards: entry.cards });
    }
    const etc = map.get(null);
    if (etc && etc.cards.length > 0) {
      ordered.push({ id: null, title: etc.title, cards: etc.cards });
    }
    return ordered;
  }, [cards, data.sections]);

  function handleCreated(card: BoardCard) {
    setCards((prev) => [...prev, withBoardAnonymousAuthor(card, data.board)]);
    onMutate();
  }

  function openComposer(sectionId: string | null) {
    setActiveSection(sectionId);
    setComposerOpen(true);
  }

  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        contentContainerStyle={styles.scroll}
        showsHorizontalScrollIndicator
      >
        {columns.length === 0 ? (
          <SurfaceCard style={styles.emptyColumn}>
            <Text style={styles.emptyEmoji}>📊</Text>
            <Text style={styles.emptyTitle}>주제가 아직 없어요</Text>
            <Text style={styles.emptyMsg}>선생님이 주제를 만들어야 카드를 올릴 수 있어요.</Text>
          </SurfaceCard>
        ) : (
          columns.map((column) => (
            <View key={column.id ?? "etc"} style={styles.column}>
              <SurfaceCard style={styles.colHead}>
                <Text style={styles.colTitle} numberOfLines={1}>
                  {column.title}
                </Text>
                <Pill tone="accent" style={styles.countPill}>
                  {column.cards.length}
                </Pill>
              </SurfaceCard>
              <AppButton
                variant="secondary"
                style={styles.addBtn}
                textStyle={styles.addText}
                onPress={() => openComposer(column.id)}
              >
                + 카드 추가
              </AppButton>
              <ScrollView
                style={styles.colBodyScroll}
                contentContainerStyle={styles.colBodyContent}
                showsVerticalScrollIndicator={false}
              >
                {column.cards.map((card) => (
                  <View key={card.id}>
                    <CardView card={card} onPress={() => setSelectedCard(card)} />
                  </View>
                ))}
              </ScrollView>
            </View>
          ))
        )}
      </ScrollView>
      <CardComposer
        visible={composerOpen}
        boardId={data.board.id}
        sectionId={activeSection}
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
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    paddingTop: spacing.lg,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xxl,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  column: {
    width: columnTokens.columnWidth,
    height: "100%",
    gap: spacing.md,
    backgroundColor: colors.transparent,
  },
  colHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  colTitle: {
    ...typography.section,
    color: colors.text,
    flex: 1,
  },
  countPill: {
    minWidth: columnTokens.countPillMinWidth,
    alignItems: "center",
  },
  addBtn: {
    borderWidth: borders.hairline,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.transparent,
  },
  addText: {
    ...typography.label,
    color: colors.textFaint,
  },
  colBodyScroll: { flex: 1 },
  colBodyContent: {
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    paddingRight: spacing.sm,
  },
  emptyColumn: {
    width: columnTokens.columnWidth,
    alignItems: "center",
    padding: spacing.xxl,
    gap: spacing.md,
  },
  emptyEmoji: { fontSize: iconSizes.empty },
  emptyTitle: { ...typography.title, color: colors.text },
  emptyMsg: { ...typography.body, color: colors.textMuted, textAlign: "center" },
});
