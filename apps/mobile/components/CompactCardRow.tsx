import { Image, StyleSheet, Text, View } from "react-native";
import {
  borders,
  colors,
  media,
  radii,
  sizing,
  spacing,
  typography,
} from "../theme/tokens";
import type { BoardCard } from "../lib/types";
import { resolveCardAuthorName } from "../lib/card-privacy";
import { getYouTubeThumbnailUrlFromLink } from "../lib/media";
import { SurfacePressable } from "./ui";

type Props = {
  card: BoardCard;
  onPress: () => void;
  showSection?: string | null;
};

export function CompactCardRow({ card, onPress, showSection }: Props) {
  const thumbnail = cardThumbnail(card);
  const author = resolveCardAuthorName(card);
  const title = card.title.trim() || card.content.trim() || "제목 없는 카드";
  const content = card.title.trim() ? card.content.trim() : "";
  const mediaLabel = cardMediaLabel(card);
  const likeCount = Math.max(0, card.likeCount ?? 0);
  const commentCount = Math.max(0, card.commentCount ?? 0);

  return (
    <SurfacePressable
      style={styles.row}
      onPress={onPress}
      accessibilityLabel={`${title}, 좋아요 ${likeCount}, 댓글 ${commentCount}`}
      accessibilityHint="카드 상세를 열어요"
    >
      <View
        style={[
          styles.colorMarker,
          { backgroundColor: card.color ?? colors.accent },
        ]}
      />
      {thumbnail ? (
        <Image
          source={{ uri: thumbnail }}
          style={styles.thumbnail}
          resizeMode="cover"
          accessible={false}
        />
      ) : (
        <View style={styles.thumbnailFallback} accessible={false}>
          <Text style={styles.thumbnailFallbackText}>{mediaLabel.icon}</Text>
        </View>
      )}

      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {card.isMine ? <Text style={styles.mineLabel}>내 카드</Text> : null}
        </View>
        {content ? (
          <Text style={styles.content} numberOfLines={2}>
            {content}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          {showSection ? (
            <Text style={styles.sectionLabel} numberOfLines={1}>
              {showSection}
            </Text>
          ) : null}
          {author ? (
            <Text style={styles.author} numberOfLines={1}>
              {author}
            </Text>
          ) : null}
          <Text style={styles.date}>{formatCardDate(card.updatedAt || card.createdAt)}</Text>
        </View>
        <View style={styles.signalRow}>
          {mediaLabel.label ? (
            <Text style={styles.mediaLabel}>{mediaLabel.label}</Text>
          ) : null}
          <Text style={styles.signal}>♡ {likeCount}</Text>
          <Text style={styles.signal}>💬 {commentCount}</Text>
        </View>
      </View>
      <Text style={styles.chevron} accessible={false}>
        ›
      </Text>
    </SurfacePressable>
  );
}

function cardThumbnail(card: BoardCard): string | null {
  return (
    card.thumbUrl ??
    card.imageUrl ??
    card.attachments?.find((attachment) => attachment.kind === "image")?.previewUrl ??
    card.attachments?.find((attachment) => attachment.kind === "image")?.url ??
    card.linkImage ??
    getYouTubeThumbnailUrlFromLink(card.linkUrl ?? card.videoUrl) ??
    null
  );
}

function cardMediaLabel(card: BoardCard): { icon: string; label: string | null } {
  const attachmentKinds = new Set(card.attachments?.map((item) => item.kind) ?? []);
  if (card.videoUrl || attachmentKinds.has("video")) {
    return { icon: "▶", label: "영상" };
  }
  if (card.fileUrl || attachmentKinds.has("file")) {
    return { icon: "📎", label: "파일" };
  }
  if (card.linkUrl || attachmentKinds.has("link")) {
    return { icon: "↗", label: "링크" };
  }
  if (card.imageUrl || card.thumbUrl || card.linkImage || attachmentKinds.has("image")) {
    return { icon: "▧", label: "이미지" };
  }
  return { icon: "✎", label: null };
}

function formatCardDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

const styles = StyleSheet.create({
  row: {
    minHeight: tapRowHeight(),
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    overflow: "hidden",
  },
  colorMarker: {
    alignSelf: "stretch",
    width: borders.medium,
    borderRadius: radii.pill,
  },
  thumbnail: {
    width: media.previewThumb,
    height: media.previewThumb,
    borderRadius: radii.control,
    backgroundColor: colors.surfaceAlt,
  },
  thumbnailFallback: {
    width: media.previewThumb,
    height: media.previewThumb,
    borderRadius: radii.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  thumbnailFallbackText: {
    ...typography.title,
    color: colors.textMuted,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    ...typography.label,
    color: colors.text,
    flex: 1,
  },
  mineLabel: {
    ...typography.micro,
    color: colors.accentTintedText,
    backgroundColor: colors.accentTintedBg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  content: {
    ...typography.micro,
    color: colors.textMuted,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minWidth: 0,
  },
  sectionLabel: {
    ...typography.micro,
    color: colors.accentTintedText,
    maxWidth: sizing.authorChipMaxWidth,
  },
  author: {
    ...typography.micro,
    color: colors.textMuted,
    flexShrink: 1,
  },
  date: {
    ...typography.micro,
    color: colors.textFaint,
    marginLeft: "auto",
  },
  signalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  mediaLabel: {
    ...typography.micro,
    color: colors.accentTintedText,
  },
  signal: {
    ...typography.micro,
    color: colors.textMuted,
  },
  chevron: {
    ...typography.title,
    color: colors.textFaint,
  },
});

function tapRowHeight(): number {
  return media.previewThumb + spacing.md * 2;
}
