import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Heart, MessageCircle, UserRound } from "lucide-react-native";
import {
  borders,
  colors,
  iconSizes,
  media,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { CardComposer } from "../CardComposer";
import { CardAuthorBottomSheet } from "../CardAuthorBottomSheet";
import { CommentBottomSheet } from "../CommentBottomSheet";
import { ExpandablePostContent } from "../ExpandablePostContent";
import { EmbeddedMedia } from "../EmbeddedMedia";
import type { BoardDetailResponse, BoardCard } from "../../lib/types";
import { apiFetch } from "../../lib/api";
import {
  buildMobileSectionSummaries,
  type MobileSectionSummary,
} from "../../lib/mobile-board-overview";
import {
  resolveCardAuthorName,
  withBoardAnonymousAuthor,
  withBoardAnonymousAuthors,
} from "../../lib/card-privacy";
import {
  buildMediaItems,
  findPlayableMediaUrl,
  mediaPreviewUrls,
} from "../../lib/media";
import {
  ControlPressable,
  SemanticNav,
  SemanticNavItem,
  SurfaceCard,
} from "../ui";
import { useBoardRealtime } from "../../lib/use-board-realtime";

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
              onOpenAuthorPicker={() => setAuthorCard(item)}
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

export function StreamFeedPost({
  card,
  onOpenComments,
  onOpenAuthorPicker,
}: {
  card: BoardCard;
  onOpenComments?: () => void;
  onOpenAuthorPicker?: () => void;
}) {
  const author = resolveCardAuthorName(card);
  const title = card.title.trim();
  const content = card.content.trim();
  const mediaItems = streamPostImages(card);
  const mediaLabel = streamPostMediaLabel(card);
  const embedUrl = findPlayableMediaUrl(card);
  const [likeCount, setLikeCount] = useState(Math.max(0, card.likeCount ?? 0));
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const commentCount = Math.max(0, card.commentCount ?? 0);
  const date = formatStreamPostDate(card.createdAt);
  const [mediaIndex, setMediaIndex] = useState(0);
  const { width } = useWindowDimensions();

  useEffect(() => {
    let cancelled = false;
    setLikeCount(Math.max(0, card.likeCount ?? 0));
    void apiFetch<{ likeCount: number; isLiked: boolean }>(
      `/api/cards/${encodeURIComponent(card.id)}/engagement`,
    )
      .then((engagement) => {
        if (cancelled) return;
        setLikeCount(Math.max(0, engagement.likeCount));
        setLiked(engagement.isLiked);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [card.id, card.likeCount]);

  async function toggleLike() {
    if (likeBusy) return;
    const previous = { liked, likeCount };
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((count) => Math.max(0, count + (nextLiked ? 1 : -1)));
    setLikeBusy(true);
    try {
      const response = await apiFetch<{ liked: boolean; count: number }>(
        `/api/cards/${encodeURIComponent(card.id)}/like`,
        { method: "POST", json: { liked: nextLiked } },
      );
      setLiked(response.liked);
      setLikeCount(Math.max(0, response.count));
    } catch {
      setLiked(previous.liked);
      setLikeCount(previous.likeCount);
    } finally {
      setLikeBusy(false);
    }
  }

  return (
    <View style={styles.feedPost}>
      <View style={styles.feedPostCopy}>
        <View style={styles.feedPostHeader}>
          {author ? (
            <Text style={styles.feedPostAuthor} numberOfLines={1}>
              {author}
            </Text>
          ) : null}
        </View>
      </View>

      {embedUrl ? (
        <EmbeddedMedia
          url={embedUrl}
          title={title || undefined}
          style={styles.feedPostEmbed}
        />
      ) : mediaItems.length > 0 ? (
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              setMediaIndex(
                Math.round(event.nativeEvent.contentOffset.x / width),
              );
            }}
            accessibilityLabel={`${title || "게시글"} 미디어 ${mediaItems.length}개`}
          >
            {mediaItems.map((uri) => (
              <View
                key={`${card.id}:${uri}`}
                style={[styles.feedPostMediaFrame, { width }]}
              >
                <Image
                  source={{ uri }}
                  style={styles.feedPostMedia}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  recyclingKey={`${card.id}:${uri}`}
                  transition={0}
                  accessible={false}
                />
              </View>
            ))}
          </ScrollView>
          {mediaItems.length > 1 ? (
            <View style={styles.feedPostPagination} accessible={false}>
              {mediaItems.map((uri, index) => (
                <View
                  key={`dot:${uri}`}
                  style={[
                    styles.feedPostPaginationDot,
                    index === mediaIndex && styles.feedPostPaginationDotActive,
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : mediaLabel ? (
        <View style={styles.feedPostMediaFallback} accessible={false}>
          <Text style={styles.feedPostMediaFallbackText} numberOfLines={2}>
            {mediaLabel}
          </Text>
        </View>
      ) : null}

      <View style={styles.feedPostEngagementWrap}>
        <View style={styles.feedPostEngagement}>
          <ControlPressable
            style={styles.feedPostLikeAction}
            onPress={() => void toggleLike()}
            disabled={likeBusy}
            accessibilityLabel={
              liked ? `좋아요 ${likeCount}, 취소` : `좋아요 ${likeCount}`
            }
            accessibilityState={{ selected: liked }}
          >
            <Heart
              size={iconSizes.md}
              color={liked ? colors.accent : colors.textMuted}
              fill={liked ? colors.accent : colors.transparent}
              strokeWidth={1.75}
              accessible={false}
            />
            <Text style={styles.feedPostEngagementCount}>{likeCount}</Text>
          </ControlPressable>
          {onOpenComments ? (
            <ControlPressable
              style={styles.feedPostCommentAction}
              onPress={onOpenComments}
              hitSlop={{ top: spacing.sm, bottom: spacing.sm }}
              accessibilityLabel={`댓글 ${commentCount}`}
            >
              <View style={styles.feedPostEngagementItem}>
                <MessageCircle
                  size={iconSizes.md}
                  color={colors.textMuted}
                  strokeWidth={1.75}
                  accessible={false}
                />
                <Text style={styles.feedPostCommentLabel}>{commentCount}</Text>
              </View>
            </ControlPressable>
          ) : null}
          {onOpenAuthorPicker ? (
            <ControlPressable
              style={styles.feedPostAuthorAssignAction}
              onPress={onOpenAuthorPicker}
              accessibilityLabel="작성자 지정"
            >
              <UserRound
                size={iconSizes.md}
                color={colors.accentTintedText}
                strokeWidth={1.75}
                accessible={false}
              />
              <Text style={styles.feedPostAuthorAssignLabel}>작성자 지정</Text>
            </ControlPressable>
          ) : null}
        </View>
      </View>

      <View style={styles.feedPostCopy}>
        {title ? (
          <Text style={styles.feedPostTitle} numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {content ? (
          <ExpandablePostContent
            content={content}
            containerStyle={styles.feedPostContentWrap}
            style={styles.feedPostContent}
          />
        ) : null}
        {date ? <Text style={styles.feedPostDate}>{date}</Text> : null}
      </View>
    </View>
  );
}

function streamPostImages(card: BoardCard): string[] {
  return mediaPreviewUrls(buildMediaItems(card));
}

function streamPostMediaLabel(card: BoardCard): string | null {
  const fileAttachment = card.attachments?.find(
    (attachment) => attachment.kind === "file",
  );
  if (
    card.videoUrl ||
    card.attachments?.some((item) => item.kind === "video")
  ) {
    return "▶ 영상";
  }
  if (card.fileUrl || fileAttachment) {
    return `📎 ${card.fileName ?? fileAttachment?.fileName ?? "파일"}`;
  }
  if (card.linkUrl) {
    return card.linkTitle ?? safeStreamPostHost(card.linkUrl);
  }
  return null;
}

function formatStreamPostDate(
  value: string | Date | null | undefined,
): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

function safeStreamPostHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
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
    justifyContent: "flex-end",
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
  feedPost: {
    gap: spacing.sm,
    paddingVertical: spacing.none,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  feedPostCopy: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  feedPostHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  feedPostAuthor: {
    ...typography.section,
    color: colors.text,
  },
  feedPostTitle: {
    ...typography.section,
    color: colors.text,
  },
  feedPostContent: {
    ...typography.body,
    color: colors.textMuted,
  },
  feedPostContentWrap: {
    position: "relative",
  },
  feedPostDate: {
    ...typography.micro,
    color: colors.textFaint,
  },
  feedPostMediaFrame: {
    aspectRatio: media.previewAspectRatio,
    padding: spacing.xs,
    backgroundColor: colors.surfaceAlt,
  },
  feedPostMedia: {
    width: "100%",
    height: "100%",
  },
  feedPostEmbed: {
    width: "100%",
    borderRadius: radii.none,
    backgroundColor: colors.surfaceAlt,
  },
  feedPostPagination: {
    minHeight: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  feedPostPaginationDot: {
    width: spacing.xxs,
    height: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  feedPostPaginationDotActive: {
    width: spacing.sm,
    backgroundColor: colors.accent,
  },
  feedPostMediaFallback: {
    minHeight: tapMin * 2,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
  },
  feedPostMediaFallbackText: {
    ...typography.label,
    color: colors.accentTintedText,
    textAlign: "center",
  },
  feedPostEngagement: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  feedPostEngagementWrap: {
    paddingHorizontal: spacing.lg,
  },
  feedPostEngagementItem: {
    minHeight: iconSizes.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  feedPostLikeAction: {
    minHeight: iconSizes.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.xxs,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  feedPostAuthorAssignAction: {
    minHeight: iconSizes.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.xxs,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  feedPostCommentAction: {
    minHeight: iconSizes.md,
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.xxs,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  feedPostCommentLabel: {
    ...typography.badge,
    color: colors.textMuted,
  },
  feedPostEngagementCount: {
    ...typography.badge,
    color: colors.textMuted,
  },
  feedPostAuthorAssignLabel: {
    ...typography.badge,
    color: colors.accentTintedText,
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
