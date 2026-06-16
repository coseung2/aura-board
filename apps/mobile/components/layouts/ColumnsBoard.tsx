import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, radii, shadows, spacing, tapMin, typography } from "../../theme/tokens";
import { CardView } from "../CardView";
import { CardComposer } from "../CardComposer";
import { CardDetailModal } from "../CardDetailModal";
import type { BoardDetailResponse, BoardCard } from "../../lib/types";

export function ColumnsBoard({
  data,
  onMutate,
}: {
  data: BoardDetailResponse;
  onMutate: () => void;
}) {
  const [cards, setCards] = useState<BoardCard[]>(data.cards);
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

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
    setCards((prev) => [...prev, card]);
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
          <View style={styles.emptyColumn}>
            <Text style={styles.emptyEmoji}>📊</Text>
            <Text style={styles.emptyTitle}>주제가 아직 없어요</Text>
            <Text style={styles.emptyMsg}>선생님이 주제를 만들어야 카드를 올릴 수 있어요.</Text>
          </View>
        ) : (
          columns.map((column) => (
            <View key={column.id ?? "etc"} style={styles.column}>
              <View style={styles.colHead}>
                <Text style={styles.colTitle} numberOfLines={1}>
                  {column.title}
                </Text>
                <View style={styles.countPill}>
                  <Text style={styles.colCount}>{column.cards.length}</Text>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
                onPress={() => openComposer(column.id)}
                accessibilityRole="button"
              >
                <Text style={styles.addText}>+ 카드 추가</Text>
              </Pressable>
              <ScrollView
                style={styles.colBodyScroll}
                contentContainerStyle={styles.colBodyContent}
                showsVerticalScrollIndicator={false}
              >
                {column.cards.map((card) => (
                  <View key={card.id} style={styles.cardWrap}>
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
    backgroundColor: "#e9f5ff",
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
    width: 312,
    height: "100%",
    gap: 10,
    backgroundColor: "transparent",
  },
  colHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  colTitle: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.15,
    color: colors.text,
    flex: 1,
  },
  countPill: {
    backgroundColor: colors.accentTintedBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    minWidth: 24,
    alignItems: "center",
  },
  colCount: {
    ...typography.badge,
    color: colors.accentTintedText,
  },
  addBtn: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
    minHeight: tapMin,
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  addBtnPressed: {
    borderColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  addText: {
    ...typography.label,
    fontSize: 13,
    color: colors.textFaint,
  },
  colBodyScroll: { flex: 1 },
  colBodyContent: {
    gap: spacing.md,
    paddingTop: 8,
    paddingBottom: spacing.xl,
    paddingRight: 6,
  },
  cardWrap: { marginBottom: 0 },
  emptyColumn: {
    width: 312,
    alignItems: "center",
    padding: spacing.xxl,
    gap: spacing.md,
    ...shadows.card,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...typography.title, color: colors.text },
  emptyMsg: { ...typography.body, color: colors.textMuted, textAlign: "center" },
});
