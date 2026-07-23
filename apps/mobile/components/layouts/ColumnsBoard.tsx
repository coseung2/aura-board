import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  borders,
  colors,
  iconSizes,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { CardComposer } from "../CardComposer";
import { nextCardOrder } from "./cards-board-utils";
import { CardAuthorBottomSheet } from "../CardAuthorBottomSheet";
import { CommentBottomSheet } from "../CommentBottomSheet";
import type { BoardDetailResponse, BoardCard } from "../../lib/types";
import {
  buildMobileSectionSummaries,
  type MobileSectionSummary,
} from "../../lib/mobile-board-overview";
import {
  withBoardAnonymousAuthor,
  withBoardAnonymousAuthors,
} from "../../lib/card-privacy";
import {
  ControlPressable,
  SurfaceCard,
} from "../ui";
import {
  SemanticNav,
  SemanticNavItem,
} from "../SemanticNavigation";
import { useBoardRealtime } from "../../lib/use-board-realtime";
import { StreamFeedPost } from "./ColumnsStreamFeedPost";

export { StreamFeedPost } from "./ColumnsStreamFeedPost";

const UNSECTIONED_KEY = "__unsectioned__";
type TopicFilter = "all" | "submitted" | "pending";

function sectionKey(sectionId: string | null): string {
  return sectionId ?? UNSECTIONED_KEY;
}

export function ColumnsBoard({
  data,
  onMutate,
  writableSectionIds,
  onSectionTitleChange,
}: {
  data: BoardDetailResponse;
  onMutate: () => void;
  writableSectionIds?: string[];
  onSectionTitleChange?: (title: string | null) => void;
}) {
  const [cards, setCards] = useState<BoardCard[]>(() =>
    withBoardAnonymousAuthors(data.cards, data.board),
  );
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(
    null,
  );
  const [composerSectionId, setComposerSectionId] = useState<string | null>(
    null,
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [commentCard, setCommentCard] = useState<BoardCard | null>(null);
  const [authorCard, setAuthorCard] = useState<BoardCard | null>(null);
  const [topicFilter, setTopicFilter] = useState<TopicFilter>("all");
  const writableSections = useMemo(
    () =>
      writableSectionIds === undefined ? null : new Set(writableSectionIds),
    [writableSectionIds],
  );

  useEffect(() => {
    setCards(
      withBoardAnonymousAuthors(
        [...data.cards].sort((a, b) => {
          const ao = a.order ?? 0;
          const bo = b.order ?? 0;
          if (ao !== bo) return ao - bo;
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        }),
        data.board,
      ),
    );
  }, [data.cards, data.board]);

  const summaries = useMemo(
    () => buildMobileSectionSummaries(cards, data.sections),
    [cards, data.sections],
  );
  const selectedSummary = useMemo(
    () =>
      selectedSectionKey === null
        ? null
        : (summaries.find(
            (summary) => sectionKey(summary.id) === selectedSectionKey,
          ) ?? null),
    [selectedSectionKey, summaries],
  );
  useEffect(() => {
    onSectionTitleChange?.(selectedSummary?.title ?? null);
  }, [onSectionTitleChange, selectedSummary?.title]);
  const visibleSummaries = useMemo(
    () =>
      summaries.filter((summary) => {
        if (topicFilter === "submitted") return summary.mineCount > 0;
        if (topicFilter === "pending") return summary.mineCount === 0;
        return true;
      }),
    [summaries, topicFilter],
  );
  const submittedTopicCount = useMemo(
    () => summaries.filter((summary) => summary.mineCount > 0).length,
    [summaries],
  );
  const selectedCards = useMemo(() => {
    if (!selectedSummary) return [];
    return cards.filter((card) =>
      selectedSummary.id === null
        ? !card.sectionId
        : card.sectionId === selectedSummary.id,
    );
  }, [cards, selectedSummary]);

  useEffect(() => {
    if (
      selectedSectionKey !== null &&
      !summaries.some(
        (summary) => sectionKey(summary.id) === selectedSectionKey,
      )
    ) {
      setSelectedSectionKey(null);
    }
  }, [selectedSectionKey, summaries]);

  function handleCreated(card: BoardCard) {
    setCards((prev) => [...prev, withBoardAnonymousAuthor(card, data.board)]);
    onMutate();
  }

  function openComposer(sectionId: string | null) {
    setComposerSectionId(sectionId);
    setComposerOpen(true);
  }

  function selectSection(sectionId: string | null) {
    setSelectedSectionKey(sectionKey(sectionId));
  }

  useBoardRealtime({ slug: data.board.id, onReload: onMutate });

  const canWriteSelected =
    selectedSummary?.id !== null &&
    selectedSummary?.id !== undefined &&
    (writableSections === null || writableSections.has(selectedSummary.id));

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {selectedSummary ? (
        <FlatList
          data={selectedCards}
          keyExtractor={(card) => card.id}
          contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={styles.detailHeaderContent}>
                <View style={styles.detailTopRow}>
                  <ControlPressable
                    style={styles.backButton}
                    onPress={() => setSelectedSectionKey(null)}
                    accessibilityLabel="주제 목록으로 돌아가기"
                  >
                    <Text style={styles.backButtonText}>← 주제</Text>
                  </ControlPressable>
                  {canWriteSelected ? (
                    <ControlPressable
                      style={styles.addIconButton}
                    onPress={() => openComposer(selectedSummary.id)}
                    accessibilityLabel="카드 추가"
                  >
                    <Text style={styles.addIconText}>＋</Text>
                  </ControlPressable>
                ) : null}
              </View>
            </View>
          }
            renderItem={({ item }) => (
              <StreamFeedPost
                card={item}
                onOpenComments={() => setCommentCard(item)}
                onOpenAuthorPicker={
                  item.canEdit === true
                    ? () => setAuthorCard(item)
                    : undefined
                }
              />
            )}
          ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
          ListEmptyComponent={
            <View style={styles.emptyDetail}>
              <Text style={styles.emptyEmoji}>📝</Text>
              <Text style={styles.emptyTitle}>아직 카드가 없어요</Text>
            </View>
          }
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        <FlatList
          data={visibleSummaries}
          key="section-overview"
          keyExtractor={(summary) => sectionKey(summary.id)}
          contentContainerStyle={styles.overviewContent}
          ListHeaderComponent={
            <View style={styles.topicFilterHeader}>
              <Text style={styles.topicFilterTitle} accessibilityRole="header">
                주제
              </Text>
              <SemanticNav
                style={styles.topicFilterNav}
                accessibilityLabel="제출 상태 필터"
              >
                <SemanticNavItem
                  selected={topicFilter === "all"}
                  onPress={() => setTopicFilter("all")}
                >
                  {`전체 ${summaries.length}`}
                </SemanticNavItem>
                <SemanticNavItem
                  selected={topicFilter === "submitted"}
                  onPress={() => setTopicFilter("submitted")}
                >
                  {`제출 ${submittedTopicCount}`}
                </SemanticNavItem>
                <SemanticNavItem
                  selected={topicFilter === "pending"}
                  onPress={() => setTopicFilter("pending")}
                >
                  {`미제출 ${summaries.length - submittedTopicCount}`}
                </SemanticNavItem>
              </SemanticNav>
            </View>
          }
          renderItem={({ item }) => (
            <SectionOverviewTile
              summary={item}
              onPress={() => selectSection(item.id)}
            />
          )}
          ListEmptyComponent={
            <SurfaceCard style={styles.emptyOverview}>
              <Text style={styles.emptyEmoji}>📊</Text>
              <Text style={styles.emptyTitle}>
                {summaries.length === 0
                  ? "주제가 아직 없어요"
                  : "조건에 맞는 주제가 없어요"}
              </Text>
            </SurfaceCard>
          }
          keyboardShouldPersistTaps="handled"
        />
      )}

      <CardComposer
        visible={composerOpen}
        boardId={data.board.id}
        sectionId={composerSectionId}
        order={nextCardOrder(cards, composerSectionId)}
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

function SectionOverviewTile({
  summary,
  onPress,
}: {
  summary: MobileSectionSummary;
  onPress: () => void;
}) {
  const submitted = summary.mineCount > 0;

  return (
    <ControlPressable
      style={styles.overviewTile}
      onPress={onPress}
      accessibilityLabel={`${summary.title}, ${submitted ? "제출 완료" : "미제출"}`}
      accessibilityHint="주제 카드를 열어요"
    >
      <View style={styles.tileHeader}>
        <Text style={styles.tileTitle} numberOfLines={1}>
          {summary.title}
        </Text>
        <Text
          style={[
            styles.submissionStatus,
            submitted ? styles.submissionComplete : styles.submissionPending,
          ]}
        >
          {submitted ? "제출 완료" : "미제출"}
        </Text>
      </View>
    </ControlPressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overviewContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  topicFilterHeader: {
    minHeight: tapMin + spacing.xs,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  topicFilterTitle: {
    ...typography.section,
    color: colors.text,
    flex: 1,
    minWidth: 0,
    paddingBottom: spacing.xs,
  },
  topicFilterNav: {
    flexShrink: 0,
    borderBottomWidth: borders.none,
  },
  overviewTile: {
    minHeight: tapMin,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.sm,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: borders.none,
    backgroundColor: colors.transparent,
  },
  tileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  tileTitle: {
    ...typography.section,
    color: colors.text,
    flex: 1,
  },
  submissionStatus: {
    ...typography.badge,
  },
  submissionComplete: {
    color: colors.accentTintedText,
  },
  submissionPending: {
    color: colors.textMuted,
  },
  emptyOverview: {
    flex: 1,
    alignItems: "center",
    padding: spacing.xxl,
    gap: spacing.md,
  },
  listContent: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.none,
    paddingBottom: spacing.xxxl,
  },
  detailHeaderContent: {
    paddingBottom: spacing.md,
  },
  detailTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    minWidth: tapMin,
    minHeight: tapMin,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.none,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  backButtonText: {
    ...typography.label,
    color: colors.accentTintedText,
  },
  addIconButton: {
    minWidth: tapMin,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.none,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  addIconText: {
    ...typography.title,
    color: colors.accentTintedText,
  },
  listSeparator: {
    height: spacing.lg,
  },
  emptyDetail: {
    alignItems: "center",
    padding: spacing.xxl,
    gap: spacing.md,
  },
  emptyEmoji: {
    fontSize: iconSizes.empty,
  },
  emptyTitle: {
    ...typography.title,
    color: colors.text,
    textAlign: "center",
  },
});
