import { useEffect, useState } from "react";
import {
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

const styles = StyleSheet.create({
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
});
