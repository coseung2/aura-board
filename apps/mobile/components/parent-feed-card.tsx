import { Image } from "expo-image";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { BoardCard, PortfolioCardDTO } from "../lib/types";
import { layoutEmoji } from "../theme/layout-meta";
import {
  borders,
  colors,
  iconSizes,
  parent,
  radii,
  spacing,
  tapMin,
  typography,
} from "../theme/tokens";
import { ControlPressable, MediaPressable, SurfaceCard } from "./ui";
import {
  countParentFeedAttachments,
  resolveParentFeedAuthor,
} from "../lib/parent-feed-presentation";

type Props = {
  card: PortfolioCardDTO;
  childName: string;
  onOpen: (card: PortfolioCardDTO) => void;
};

export function ParentFeedCard({ card, childName, onOpen }: Props) {
  const { width } = useWindowDimensions();
  const isNarrow = width < 768;
  const previewUrl = getPreviewUrl(card);
  const sourceLabel = buildSourceLabel(card);
  const title = card.title.trim();
  const content = card.content.trim();
  const authorName = resolveParentFeedAuthor(card, childName);
  const attachmentCount = countParentFeedAttachments(card);
  const mediaLabel = `${childName}의 ${title || sourceLabel} 게시물 상세 보기`;

  return (
    <SurfaceCard
      style={[styles.card, isNarrow && styles.cardNarrow]}
      accessible={false}
      accessibilityLabel={`${childName}의 게시물`}
    >
      <View style={styles.header}>
        <View style={styles.avatar} accessible accessibilityRole="image">
          <Text style={styles.avatarText}>{childName.slice(0, 1)}</Text>
        </View>
        <View style={styles.headerCopy}>
          <Text selectable style={styles.author} numberOfLines={1}>
            {authorName}
          </Text>
          <Text selectable style={styles.source} numberOfLines={1}>
            {sourceLabel}
          </Text>
        </View>
        <Text selectable style={styles.date}>
          {formatFeedDate(card.createdAt)}
        </Text>
      </View>

      <MediaPressable
        accessibilityRole="button"
        accessibilityLabel={mediaLabel}
        onPress={() => onOpen(card)}
        style={styles.media}
      >
        {previewUrl ? (
          <Image
            source={{ uri: previewUrl }}
            style={styles.image}
            contentFit="cover"
            accessibilityLabel={title || `${sourceLabel} 첨부 이미지`}
          />
        ) : (
          <View style={styles.fallback}>
            <Text style={styles.fallbackEmoji}>
              {layoutEmoji(card.sourceBoard.layout)}
            </Text>
            <Text selectable style={styles.fallbackText}>
              {hasVideo(card) ? "동영상 게시물" : "게시물 자세히 보기"}
            </Text>
          </View>
        )}
        {hasVideo(card) ? (
          <View style={styles.playBadge} pointerEvents="none">
            <Text style={styles.playText}>▶</Text>
          </View>
        ) : null}
        {attachmentCount > 1 ? (
          <View style={styles.attachmentBadge} pointerEvents="none">
            <Text style={styles.attachmentBadgeText}>
              1/{attachmentCount}
            </Text>
          </View>
        ) : null}
      </MediaPressable>

      <View style={styles.body}>
        <View
          style={styles.counts}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`좋아요 ${card.likeCount}개, 댓글 ${card.commentCount}개`}
        >
          <Text selectable style={styles.countText}>
            ♥ {formatCount(card.likeCount)}
          </Text>
          <Text selectable style={styles.countText}>
            💬 {formatCount(card.commentCount)}
          </Text>
        </View>

        {title || content ? (
          <View style={styles.caption}>
            {title ? (
              <Text selectable style={styles.title}>
                {title}
              </Text>
            ) : null}
            {content ? (
              <Text selectable style={styles.content} numberOfLines={3}>
                {content}
              </Text>
            ) : null}
          </View>
        ) : null}

        <ControlPressable
          style={styles.detailButton}
          onPress={() => onOpen(card)}
          accessibilityLabel={`${title || sourceLabel} 게시물 상세와 댓글 보기`}
        >
          <Text style={styles.detailButtonText}>상세와 댓글 보기</Text>
        </ControlPressable>
      </View>
    </SurfaceCard>
  );
}

export function toParentFeedBoardCard(
  card: PortfolioCardDTO,
  fallbackAuthorName: string,
): BoardCard {
  return {
    id: card.id,
    boardId: card.sourceBoard.id,
    title: card.title,
    content: card.content,
    color: card.color,
    imageUrl: card.imageUrl,
    thumbUrl: card.thumbUrl,
    linkUrl: card.linkUrl,
    linkTitle: card.linkTitle,
    linkDesc: card.linkDesc,
    linkImage: card.linkImage,
    videoUrl: card.videoUrl,
    fileUrl: card.fileUrl,
    fileName: card.fileName,
    fileSize: card.fileSize,
    fileMimeType: card.fileMimeType,
    x: 0,
    y: 0,
    width: card.width,
    height: card.height,
    order: 0,
    sectionId: card.sourceSection?.id ?? null,
    authorId: null,
    externalAuthorName: card.externalAuthorName,
    studentAuthorId: null,
    createdAt: card.createdAt,
    updatedAt: card.createdAt,
    likeCount: card.likeCount,
    commentCount: card.commentCount,
    attachments: card.attachments
      .filter((attachment) =>
        ["image", "video", "file"].includes(attachment.kind),
      )
      .map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind as "image" | "video" | "file",
        url: attachment.url,
        previewUrl: attachment.previewUrl,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
        order: attachment.order,
      })),
    authors: card.authors,
    authorName: resolveParentFeedAuthor(card, fallbackAuthorName),
    studentAuthorName: card.studentAuthorName ?? fallbackAuthorName,
    anonymousAuthor: card.sourceBoard.anonymousAuthor,
  };
}

function getPreviewUrl(card: PortfolioCardDTO): string | null {
  return (
    card.thumbUrl ??
    card.imageUrl ??
    card.attachments.find((item) => item.kind === "image")?.previewUrl ??
    card.attachments.find((item) => item.kind === "image")?.url ??
    card.linkImage
  );
}

function hasVideo(card: PortfolioCardDTO): boolean {
  return Boolean(
    card.videoUrl || card.attachments.some((item) => item.kind === "video"),
  );
}

function buildSourceLabel(card: PortfolioCardDTO): string {
  if (card.sourceBoard.layout === "columns" && card.sourceSection) {
    return `${card.sourceBoard.title} · ${card.sourceSection.title}`;
  }
  return card.sourceBoard.title;
}

function formatFeedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

function formatCount(value: number): string {
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}만`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}천`;
  return value.toLocaleString("ko-KR");
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: parent.portfolioCardMinWidth * 2 - spacing.lg,
    alignSelf: "center",
    overflow: "hidden",
  },
  cardNarrow: {
    borderRadius: radii.none,
    borderLeftWidth: borders.none,
    borderRightWidth: borders.none,
    boxShadow: "none",
  },
  header: {
    minHeight: parent.feedPostHeaderMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  avatar: {
    width: parent.feedAvatarSize,
    height: parent.feedAvatarSize,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentTintedBg,
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
  avatarText: { ...typography.subtitle, color: colors.accentTintedText },
  headerCopy: { flex: 1, minWidth: 0 },
  author: { ...typography.label, color: colors.text },
  source: { ...typography.micro, color: colors.textMuted },
  date: { ...typography.micro, color: colors.textFaint },
  media: {
    position: "relative",
    width: "100%",
    aspectRatio: 1,
    backgroundColor: colors.bgAlt,
    borderTopWidth: borders.hairline,
    borderBottomWidth: borders.hairline,
    borderColor: colors.border,
  },
  image: { width: "100%", height: "100%" },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.accentTintedBg,
  },
  fallbackEmoji: { fontSize: iconSizes.hero },
  fallbackText: { ...typography.body, color: colors.accentTintedText },
  playBadge: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: parent.feedPlayButtonSize,
    height: parent.feedPlayButtonSize,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay,
    transform: [
      { translateX: -parent.feedPlayButtonSize / 2 },
      { translateY: -parent.feedPlayButtonSize / 2 },
    ],
  },
  playText: { ...typography.title, color: colors.onAccent },
  attachmentBadge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.overlay,
  },
  attachmentBadgeText: {
    ...typography.micro,
    color: colors.onAccent,
    fontVariant: ["tabular-nums"],
  },
  body: { gap: spacing.md, padding: spacing.lg },
  counts: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  countText: {
    ...typography.label,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  caption: { gap: spacing.xs },
  title: { ...typography.section, color: colors.text },
  content: { ...typography.body, color: colors.text },
  detailButton: {
    alignSelf: "flex-start",
    minHeight: tapMin,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    backgroundColor: colors.transparent,
    borderColor: colors.transparent,
  },
  detailButtonText: { ...typography.label, color: colors.textMuted },
});
