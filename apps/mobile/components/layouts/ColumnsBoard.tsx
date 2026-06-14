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

// 주제별 보드(columns) — 섹션(Section) 별 세로 칼럼, 카드를 섹션에 묶어서 렌더.
// 섹션 없는 카드는 "기타" 칼럼에 모음.

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
    for (const s of data.sections) {
      map.set(s.id, { title: s.title, cards: [] });
    }
    map.set(null, { title: "기타", cards: [] });
    for (const c of cards) {
      const target = map.get(c.sectionId) ?? map.get(null);
      if (target) target.cards.push(c);
    }
    // sections 순서 + 기타 맨 뒤.
    const ordered: Array<{ id: string | null; title: string; cards: BoardCard[] }> = [];
    for (const s of data.sections) {
      const entry = map.get(s.id);
      if (entry) ordered.push({ id: s.id, title: entry.title, cards: entry.cards });
    }
    const etc = map.get(null);
    if (etc && etc.cards.length > 0) ordered.push({ id: null, title: etc.title, cards: etc.cards });
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
          columns.map((col) => (
            <View key={col.id ?? "etc"} style={styles.column}>
              <View style={styles.colHead}>
                <Text style={styles.colTitle}>{col.title}</Text>
                <Text style={styles.colCount}>{col.cards.length}</Text>
              </View>
              <ScrollView contentContainerStyle={styles.colBody}>
                {col.cards.map((c) => (
                  <Pressable
                    key={c.id}
                    style={styles.cardWrap}
                    onPress={() => setSelectedCard(c)}
                  >
                    <CardView card={c} />
                  </Pressable>
                ))}
                <Pressable
                  style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
                  onPress={() => openComposer(col.id)}
                >
                  <Text style={styles.addText}>＋ 카드 추가</Text>
                </Pressable>
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
  root: { flex: 1 },
  scroll: { padding: spacing.xl, gap: spacing.lg, flexDirection: "row" },
  column: {
    width: 320,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
    maxHeight: "100%",
  },
  colHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
  },
  colTitle: { ...typography.section, color: colors.text },
  colCount: {
    ...typography.label,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    minWidth: 24,
    textAlign: "center",
  },
  colBody: { gap: spacing.sm, paddingBottom: spacing.md },
  cardWrap: { marginBottom: spacing.xs },
  addBtn: {
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
    minHeight: tapMin,
    justifyContent: "center",
  },
  addBtnPressed: { backgroundColor: colors.surface },
  addText: { ...typography.label, color: colors.textFaint },
  emptyColumn: {
    width: 320,
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
