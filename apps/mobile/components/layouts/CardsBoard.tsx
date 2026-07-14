import { useEffect, useMemo, useState } from "react";
import { SectionList, StyleSheet, Text, View } from "react-native";
import {
  boardThemes,
  colors,
  controls,
  iconSizes,
  layout,
  normalizeBoardTheme,
  spacing,
  typography,
} from "../../theme/tokens";
import { CardComposer } from "../CardComposer";
import { CardAuthorBottomSheet } from "../CardAuthorBottomSheet";
import { CommentBottomSheet } from "../CommentBottomSheet";
import {
  BoardSummaryStrip,
  MobileFilterBar,
  type FilterOption,
} from "../MobileBoardOverview";
import type { BoardDetailResponse, BoardCard, Section } from "../../lib/types";
import {
  filterMobileCards,
  summarizeMobileCards,
  type MobileCardFilter,
} from "../../lib/mobile-board-overview";
import {
  withBoardAnonymousAuthor,
  withBoardAnonymousAuthors,
} from "../../lib/card-privacy";
import { Fab } from "../ui";
import { useBoardRealtime } from "../../lib/use-board-realtime";
import { StreamFeedPost } from "./ColumnsBoard";

// freeform / grid / stream 공용 — 모바일에서는 세로 피드로 일관되게 보여준다.

type SectionGroup = {
  section: Section | { id: string; title: string; order: number; color: null };
  cards: BoardCard[];
};

function sortCards(cards: BoardCard[]): BoardCard[] {
  return [...cards].sort((a, b) => {
    const ao = a.order ?? 0;
    const bo = b.order ?? 0;
    if (ao !== bo) return ao - bo;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

function groupCardsBySection(
  cards: BoardCard[],
  sections: Section[],
): SectionGroup[] {
  const knownIds = new Set(sections.map((s) => s.id));
  const bySection = new Map<string, BoardCard[]>();
  const unsectioned: BoardCard[] = [];

  for (const card of cards) {
    const sid = card.sectionId ?? null;
    if (sid && knownIds.has(sid)) {
      const bucket = bySection.get(sid) ?? [];
      bucket.push(card);
      bySection.set(sid, bucket);
    } else {
      unsectioned.push(card);
    }
  }

  const groups: SectionGroup[] = [];
  for (const section of sections) {
    const bucket = bySection.get(section.id);
    if (bucket && bucket.length > 0) {
      groups.push({ section, cards: sortCards(bucket) });
    }
  }
  if (unsectioned.length > 0) {
    groups.push({
      section: {
        id: "__unsectioned__",
        title: "섹션 없음",
        order: Number.MAX_SAFE_INTEGER,
        color: null,
      },
      cards: sortCards(unsectioned),
    });
  }
  return groups;
}

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
  const [filter, setFilter] = useState<MobileCardFilter>("all");
  const [query, setQuery] = useState("");
  const boardTheme = boardThemes[normalizeBoardTheme(data.board.boardTheme)];

  const summary = useMemo(
    () => summarizeMobileCards(cards, data.sections),
    [cards, data.sections],
  );
  const filteredCards = useMemo(
    () => filterMobileCards(cards, filter, query),
    [cards, filter, query],
  );
  const sectionGroups = useMemo(
    () => groupCardsBySection(filteredCards, data.sections),
    [filteredCards, data.sections],
  );
  const streamSections = useMemo(
    () =>
      sectionGroups.map((group) => ({
        title: group.section.title,
        data: group.cards,
      })),
    [sectionGroups],
  );
  const filterOptions = useMemo<Array<FilterOption<MobileCardFilter>>>(
    () => [
      { value: "all", label: "전체", count: summary.total },
      { value: "mine", label: "내 카드", count: summary.mine },
      { value: "media", label: "미디어", count: summary.media },
      { value: "comments", label: "댓글 있음" },
    ],
    [summary],
  );

  useEffect(() => {
    setCards(withBoardAnonymousAuthors(sortCards(data.cards), data.board));
  }, [data.cards, data.board]);

  function handleCreated(card: BoardCard) {
    setCards((prev) => [...prev, withBoardAnonymousAuthor(card, data.board)]);
    onMutate();
  }

  // realtime: broadcast 가 도착하면 부모에서 board 데이터를 다시 받게 한다.
  // 서버 broadcast channel key 가 board.id 기준이므로 id 로 구독한다.
  useBoardRealtime({ slug: data.board.id, onReload: onMutate });

  const header = (
    <View style={styles.headerContent}>
      <BoardSummaryStrip
        title="보드 한눈에 보기"
        description="카드 크기보다 작성·미디어·반응 상태를 먼저 비교해요."
        metrics={[
          { label: "카드", value: summary.total },
          { label: "내 카드", value: summary.mine, tone: "accent" },
          { label: "댓글", value: summary.comments },
          { label: "섹션", value: summary.sections },
        ]}
      />
      <MobileFilterBar
        query={query}
        onQueryChange={setQuery}
        queryPlaceholder="제목·내용·작성자 검색"
        options={filterOptions}
        value={filter}
        onChange={setFilter}
      />
    </View>
  );

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
    <View style={[styles.root, { backgroundColor: boardTheme.background }]}>
      <SectionList
        sections={streamSections}
        keyExtractor={(card) => card.id}
        contentContainerStyle={styles.streamContent}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <View style={styles.streamSectionHeader}>
            <Text style={styles.streamSectionTitle}>{section.title}</Text>
            <Text style={styles.streamSectionCount}>{section.data.length}개</Text>
          </View>
        )}
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
        SectionSeparatorComponent={() => <View style={styles.streamSectionSeparator} />}
        ListEmptyComponent={emptyState}
        stickySectionHeadersEnabled={false}
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
  root: { flex: 1 },
  headerContent: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  streamContent: {
    padding: layout.boardGridPadding,
    paddingBottom: spacing.xxxl + controls.fab,
  },
  streamSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.transparent,
  },
  streamSectionTitle: {
    ...typography.section,
    color: colors.text,
    flex: 1,
  },
  streamSectionCount: {
    ...typography.badge,
    color: colors.accentTintedText,
  },
  streamSeparator: {
    height: spacing.sm,
  },
  streamSectionSeparator: {
    height: spacing.md,
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
