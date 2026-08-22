import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Heart, MessageCircle, MoreHorizontal, UserRound } from "lucide-react-native";
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
import { youtubeThumbnailUrl, type FeedPostView } from "../../lib/feed";
import { ApiError, apiFetch, parentApiFetch } from "../../lib/api";
import type { CommentViewer } from "../../lib/comment-audience";
import { resolveCardAuthorName } from "../../lib/card-privacy";
import {
  buildMediaItems,
  findPlayableMediaUrl,
  mediaPreviewUrls,
} from "../../lib/media";
import { BarePressable, ControlPressable } from "../ui";
import type { PostAnchor } from "../PostModerationOverlay";

export type StreamFeedPostEngagementMode = "interactive" | "summary";
const ENGAGEMENT_CACHE_MS = 5 * 60_000;

type Props = {
  card?: BoardCard;
  /** FeedPostView is rendered directly; it is never converted to a BoardCard. */
  feedPost?: FeedPostView;
  onOpenComments?: () => void;
  onOpenAuthorPicker?: () => void;
  onLongPress?: (anchor: PostAnchor) => void;
  engagementMode?: StreamFeedPostEngagementMode;
  authorLabel?: string | null;
  highlighted?: boolean;
  viewer?: CommentViewer;
  onUnauthorized?: (error: unknown) => void | Promise<void>;
  deferEmbeddedMedia?: boolean;
};

export function StreamFeedPost({
  card,
  feedPost,
  onOpenComments,
  onOpenAuthorPicker,
  onLongPress,
  engagementMode = "interactive",
  authorLabel,
  highlighted = false,
  viewer = "student",
  onUnauthorized,
  deferEmbeddedMedia = false,
}: Props) {
  if (!card && !feedPost) return null;
  const postId = feedPost?.postId ?? card?.id ?? "";
  const author =
    authorLabel === undefined
      ? feedPost?.authorDisplayName ?? resolveCardAuthorName(card!)
      : authorLabel;
  const title = (feedPost?.title ?? card?.title ?? "").trim();
  const displayTitle = title && title !== author?.trim() ? title : "";
  const content = (feedPost?.body ?? card?.content ?? "").trim();
  const mediaItems = feedPost ? feedPostImages(feedPost) : streamPostImages(card!);
  const mediaLabel = feedPost ? feedPostMediaLabel(feedPost) : streamPostMediaLabel(card!);
  const embedUrl = feedPost ? null : findPlayableMediaUrl(card!);
  const hasMediaSurface = Boolean(
    embedUrl || mediaItems.length > 0 || mediaLabel,
  );
  const textActsAsMedia = !hasMediaSurface && Boolean(displayTitle || content);
  const [likeCount, setLikeCount] = useState(
    Math.max(0, feedPost?.likeCount ?? card?.likeCount ?? 0),
  );
  const [liked, setLiked] = useState(feedPost?.isLiked ?? false);
  const [likeBusy, setLikeBusy] = useState(false);
  const commentCount = Math.max(0, feedPost?.commentCount ?? card?.commentCount ?? 0);
  const date = formatStreamPostDate(feedPost?.publishedAt ?? card?.createdAt);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [mediaWidth, setMediaWidth] = useState(0);
  const postRef = useRef<View>(null);

  function handleLongPress() {
    if (!onLongPress) return;
    postRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress({ x, y, width, height });
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLikeCount(Math.max(0, feedPost?.likeCount ?? card?.likeCount ?? 0));
    setLiked(feedPost?.isLiked ?? false);
    setLikeBusy(false);

    if (feedPost || engagementMode !== "interactive") return undefined;

    const request = viewer === "parent" ? parentApiFetch : apiFetch;
    void request<{ likeCount: number; isLiked: boolean }>(
      `/api/cards/${encodeURIComponent(card!.id)}/engagement`,
      { cacheTtlMs: ENGAGEMENT_CACHE_MS },
    )
      .then((engagement) => {
        if (cancelled) return;
        setLikeCount(Math.max(0, engagement.likeCount));
        setLiked(engagement.isLiked);
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          void onUnauthorized?.(error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [feedPost, card?.id, card?.likeCount, engagementMode, onUnauthorized, viewer]);

  useEffect(() => {
    setMediaIndex(0);
  }, [postId]);

  async function toggleLike() {
    if (engagementMode !== "interactive" || likeBusy) return;
    const previous = { liked, likeCount };
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((count) => Math.max(0, count + (nextLiked ? 1 : -1)));
    setLikeBusy(true);
    try {
      const request = viewer === "parent" ? parentApiFetch : apiFetch;
      const response = await request<{ liked: boolean; count: number }>(
        feedPost
          ? `/api/student/feed/${encodeURIComponent(feedPost.postId)}/like`
          : `/api/cards/${encodeURIComponent(card!.id)}/like`,
        { method: "POST", json: { liked: nextLiked } },
      );
      setLiked(response.liked);
      setLikeCount(Math.max(0, response.count));
      if (!feedPost) {
        void request<{ likeCount: number; isLiked: boolean }>(
          `/api/cards/${encodeURIComponent(card!.id)}/engagement`,
          {
            cacheTtlMs: ENGAGEMENT_CACHE_MS,
            forceRefresh: true,
          },
        ).catch(() => undefined);
      }
    } catch (error) {
      setLiked(previous.liked);
      setLikeCount(previous.likeCount);
      if (error instanceof ApiError && error.status === 401) {
        await onUnauthorized?.(error);
      }
    } finally {
      setLikeBusy(false);
    }
  }

  const textBody = (
    <>
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
    </>
  );

  return (
    <View
      ref={postRef}
      style={[styles.feedPost, highlighted && styles.feedPostHighlighted]}
    >
      {author || onLongPress ? (
        <BarePressable
          style={styles.feedPostCopy}
          onLongPress={onLongPress ? handleLongPress : undefined}
          delayLongPress={450}
          disabled={!onLongPress}
          accessibilityLabel={`${author ? `${author}의 ` : ""}게시물`}
          accessibilityHint={onLongPress ? "길게 누르면 숨기기와 신고 메뉴가 열립니다" : undefined}
        >
          <View style={styles.feedPostHeader}>
            {author ? (
              <Text selectable style={styles.feedPostAuthor} numberOfLines={1}>
                {author}
              </Text>
            ) : (
              <View style={styles.feedPostHeaderSpacer} />
            )}
            {onLongPress ? (
              <BarePressable
                style={styles.feedPostMenuAction}
                onPress={handleLongPress}
                accessibilityLabel="게시물 숨기기 및 신고 메뉴"
                accessibilityHint="게시물을 숨기거나 신고할 수 있는 메뉴를 엽니다"
              >
                <MoreHorizontal
                  size={iconSizes.md}
                  color={colors.textMuted}
                  strokeWidth={2}
                  accessible={false}
                />
              </BarePressable>
            ) : null}
          </View>
        </BarePressable>
      ) : null}

      {embedUrl ? (
        <EmbeddedMedia
          url={embedUrl}
          title={title || undefined}
          previewUrl={mediaItems[0] ?? null}
          deferLoad={deferEmbeddedMedia}
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
            directionalLockEnabled
            scrollEnabled={mediaItems.length > 1}
            showsHorizontalScrollIndicator={false}
            onScroll={(event) => {
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
            scrollEventThrottle={16}
            accessibilityLabel={`${title || "게시글"} 미디어 ${mediaItems.length}개`}
          >
            {mediaItems.map((uri) => (
              <View
                key={`${postId}:${uri}`}
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
                  recyclingKey={`${postId}:${uri}`}
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

      {textActsAsMedia ? (
        <BarePressable
          style={styles.feedPostCopy}
          onLongPress={onLongPress ? handleLongPress : undefined}
          delayLongPress={450}
          disabled={!onLongPress}
          accessibilityLabel={`${author ? `${author}의 ` : ""}게시물 본문`}
          accessibilityHint={onLongPress ? "길게 누르면 숨기기와 신고 메뉴가 열립니다" : undefined}
        >
          {textBody}
        </BarePressable>
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
        {!textActsAsMedia ? textBody : null}
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

function feedPostImages(post: FeedPostView): string[] {
  return post.media
    .map((item) => (item.kind === "IMAGE" ? item.url : youtubeThumbnailUrl(item)))
    .filter((url): url is string => Boolean(url));
}

function feedPostMediaLabel(post: FeedPostView): string | null {
  if (post.media.some((item) => item.kind === "YOUTUBE")) return "YouTube 영상";
  return post.media.length > 0 ? "이미지" : null;
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
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  feedPostAuthor: {
    ...typography.section,
    color: colors.text,
    flex: 1,
    minWidth: 0,
  },
  feedPostHeaderSpacer: {
    flex: 1,
  },
  feedPostMenuAction: {
    width: tapMin,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
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
    gap: spacing.xs + 1,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  feedPostPaginationDot: {
    width: spacing.xs + 2,
    height: spacing.xs + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.textFaint,
  },
  feedPostPaginationDotActive: {
    width: spacing.lg,
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
