import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
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
import { ExpandablePostContent } from "../ExpandablePostContent";
import { EmbeddedMedia } from "../EmbeddedMedia";
import type { BoardCard } from "../../lib/types";
import { apiFetch } from "../../lib/api";
import { resolveCardAuthorName } from "../../lib/card-privacy";
import {
  buildMediaItems,
  findPlayableMediaUrl,
  mediaPreviewUrls,
} from "../../lib/media";
import { ControlPressable } from "../ui";

export type StreamFeedPostEngagementMode = "interactive" | "summary";

type Props = {
  card: BoardCard;
  onOpenComments?: () => void;
  onOpenAuthorPicker?: () => void;
  engagementMode?: StreamFeedPostEngagementMode;
  authorLabel?: string | null;
  highlighted?: boolean;
};

export function StreamFeedPost({
  card,
  onOpenComments,
  onOpenAuthorPicker,
  engagementMode = "interactive",
  authorLabel,
  highlighted = false,
}: Props) {
  const author =
    authorLabel === undefined ? resolveCardAuthorName(card) : authorLabel;
  const title = card.title.trim();
  const displayTitle = title && title !== author?.trim() ? title : "";
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
  const [mediaWidth, setMediaWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLikeCount(Math.max(0, card.likeCount ?? 0));
    setLiked(false);
    setLikeBusy(false);

    if (engagementMode !== "interactive") return undefined;

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
  }, [card.id, card.likeCount, engagementMode]);

  useEffect(() => {
    setMediaIndex(0);
  }, [card.id]);

  async function toggleLike() {
    if (engagementMode !== "interactive" || likeBusy) return;
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
    <View
      style={[styles.feedPost, highlighted && styles.feedPostHighlighted]}
      accessibilityLabel={`${author ? `${author}의 ` : ""}게시물`}
    >
      {author ? (
        <View style={styles.feedPostCopy}>
          <View style={styles.feedPostHeader}>
            <Text selectable style={styles.feedPostAuthor} numberOfLines={1}>
              {author}
            </Text>
          </View>
        </View>
      ) : null}

      {embedUrl ? (
        <EmbeddedMedia
          url={embedUrl}
          title={title || undefined}
          style={styles.feedPostEmbed}
        />
      ) : mediaItems.length > 0 ? (
        <View
          onLayout={(event) => {
            const nextWidth = event.nativeEvent.layout.width;
            if (nextWidth > 0 && nextWidth !== mediaWidth) setMediaWidth(nextWidth);
          }}
        >
          <ScrollView
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const pageWidth = event.nativeEvent.layoutMeasurement.width;
              if (pageWidth <= 0) return;
              setMediaIndex(
                Math.min(
                  mediaItems.length - 1,
                  Math.max(
                    0,
                    Math.round(event.nativeEvent.contentOffset.x / pageWidth),
                  ),
                ),
              );
            }}
            accessibilityLabel={`${title || "게시글"} 미디어 ${mediaItems.length}개`}
          >
            {mediaItems.map((uri) => (
              <View
                key={`${card.id}:${uri}`}
                style={[
                  styles.feedPostMediaFrame,
                  { width: Math.max(mediaWidth, 1) },
                ]}
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
          {engagementMode === "interactive" ? (
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
          ) : (
            <View
              style={styles.feedPostEngagementItem}
              accessible
              accessibilityLabel={`좋아요 ${likeCount}`}
            >
              <Heart
                size={iconSizes.md}
                color={colors.textMuted}
                fill={colors.transparent}
                strokeWidth={1.75}
                accessible={false}
              />
              <Text style={styles.feedPostEngagementCount}>{likeCount}</Text>
            </View>
          )}

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
          ) : engagementMode === "summary" ? (
            <View
              style={styles.feedPostEngagementItem}
              accessible
              accessibilityLabel={`댓글 ${commentCount}`}
            >
              <MessageCircle
                size={iconSizes.md}
                color={colors.textMuted}
                strokeWidth={1.75}
                accessible={false}
              />
              <Text style={styles.feedPostCommentLabel}>{commentCount}</Text>
            </View>
          ) : null}

          {engagementMode === "interactive" && onOpenAuthorPicker ? (
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
        {displayTitle ? (
          <Text selectable style={styles.feedPostTitle} numberOfLines={2}>
            {displayTitle}
          </Text>
        ) : null}
        {content ? (
          <ExpandablePostContent
            content={content}
            containerStyle={styles.feedPostContentWrap}
            style={styles.feedPostContent}
          />
        ) : null}
        {date ? (
          <Text selectable style={styles.feedPostDate}>
            {date}
          </Text>
        ) : null}
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
  const linkAttachment = card.attachments?.find(
    (attachment) => attachment.kind === "link",
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
  if (card.linkUrl || linkAttachment) {
    const linkUrl = card.linkUrl ?? linkAttachment?.url ?? "";
    return (
      card.linkTitle ??
      linkAttachment?.fileName ??
      safeStreamPostHost(linkUrl)
    );
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

const styles = StyleSheet.create({
  feedPost: {
    gap: spacing.sm,
    paddingVertical: spacing.none,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  feedPostHighlighted: {
    paddingVertical: spacing.sm,
    borderWidth: borders.medium,
    borderColor: colors.accent,
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
});
