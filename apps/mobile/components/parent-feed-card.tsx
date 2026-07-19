import { useState } from "react";
import { Image } from "expo-image";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { ParentPostDTO, PortfolioCardDTO } from "../lib/types";
import { layoutEmoji } from "../theme/layout-meta";
import {
  borders,
  colors,
  iconSizes,
  media,
  parent,
  radii,
  spacing,
  tapMin,
  typography,
} from "../theme/tokens";
import { SurfaceCard } from "./ui";
import { ExpandablePostContent } from "./ExpandablePostContent";
import { resolveParentFeedAuthor } from "../lib/parent-feed-presentation";

type Props = {
  card: ParentPostDTO | PortfolioCardDTO;
  childName?: string;
  highlighted?: boolean;
};

type FeedMediaItem = {
  id: string;
  kind: "image" | "video" | "file" | "link" | "text";
  uri: string | null;
  previewUri: string | null;
  label: string;
  detail: string | null;
};

export function ParentFeedCard({ card, childName, highlighted = false }: Props) {
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [mediaWidth, setMediaWidth] = useState(0);
  const { width } = useWindowDimensions();
  const isNarrow = width < 768;
  const linkedChildNames =
    "linkedChildren" in card
      ? card.linkedChildren.map((child) => child.name).filter(Boolean).join(" · ")
      : "";
  const attribution = linkedChildNames || childName || "우리 아이";
  const sourceLabel = buildSourceLabel(card);
  const title = card.title.trim();
  const content = card.content.trim();
  const authorName = resolveParentFeedAuthor(card, attribution);
  const mediaItems = buildMediaItems(card, title, sourceLabel);

  return (
    <SurfaceCard
      style={[
        styles.card,
        isNarrow && styles.cardNarrow,
        highlighted && styles.cardHighlighted,
      ]}
      accessible={false}
      accessibilityLabel={`${attribution}의 게시물${highlighted ? ", 선택한 게시물" : ""}`}
    >
      <View style={styles.header}>
        <View style={styles.avatar} accessible accessibilityRole="image">
          <Text style={styles.avatarText}>{attribution.slice(0, 1)}</Text>
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

      <View
        style={styles.media}
        onLayout={(event) => setMediaWidth(event.nativeEvent.layout.width)}
      >
        <ScrollView
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(event) => {
            const width = event.nativeEvent.layoutMeasurement.width;
            if (width > 0) {
              setActiveMediaIndex(
                Math.min(
                  mediaItems.length - 1,
                  Math.max(
                    0,
                    Math.round(event.nativeEvent.contentOffset.x / width),
                  ),
                ),
              );
            }
          }}
          contentContainerStyle={styles.mediaPagerContent}
          style={styles.mediaPager}
        >
          {mediaItems.map((item, index) => (
            <View
              key={item.id}
              style={[styles.mediaPage, mediaWidth > 0 && { width: mediaWidth }]}
              accessible
              accessibilityLabel={`첨부 ${index + 1}/${mediaItems.length}: ${item.label}`}
            >
              {item.kind === "image" ? (
                <Image
                  source={{ uri: item.previewUri ?? item.uri ?? "" }}
                  style={styles.image}
                  contentFit="cover"
                  accessibilityLabel={item.label}
                />
              ) : item.kind === "video" ? (
                <View style={styles.fallback}>
                  {item.previewUri ? (
                    <Image
                      source={{ uri: item.previewUri }}
                      style={styles.image}
                      contentFit="cover"
                      accessibilityLabel={`${item.label} 미리보기`}
                    />
                  ) : null}
                  <View style={styles.videoOverlay} pointerEvents="none">
                    <Text style={styles.playText}>▶</Text>
                    <Text selectable style={styles.fallbackText}>
                      동영상 첨부
                    </Text>
                  </View>
                </View>
              ) : item.kind === "file" ? (
                <View style={styles.attachmentPage}>
                  <Text style={styles.attachmentEmoji}>📎</Text>
                  <Text selectable style={styles.attachmentTitle}>
                    {item.label}
                  </Text>
                  {item.detail ? (
                    <Text
                      selectable
                      style={styles.attachmentDetail}
                      numberOfLines={2}
                    >
                      {item.detail}
                    </Text>
                  ) : null}
                </View>
              ) : item.kind === "link" ? (
                <View style={styles.linkPage}>
                  {item.previewUri ? (
                    <Image
                      source={{ uri: item.previewUri }}
                      style={styles.linkImage}
                      contentFit="cover"
                      accessibilityLabel={`${item.label} 미리보기`}
                    />
                  ) : null}
                  <Text style={styles.attachmentEmoji}>🔗</Text>
                  <Text selectable style={styles.attachmentTitle}>
                    {item.label}
                  </Text>
                  {item.detail ? (
                    <Text
                      selectable
                      style={styles.attachmentDetail}
                      numberOfLines={3}
                    >
                      {item.detail}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View style={styles.fallback}>
                  <Text style={styles.fallbackEmoji}>
                    {layoutEmoji(card.sourceBoard.layout)}
                  </Text>
                  <Text selectable style={styles.fallbackText}>
                    게시물
                  </Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
        {mediaItems.length > 1 ? (
          <View style={styles.attachmentBadge} pointerEvents="none">
            <Text style={styles.attachmentBadgeText}>
              {activeMediaIndex + 1}/{mediaItems.length}
            </Text>
          </View>
        ) : null}
      </View>

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
              <ExpandablePostContent content={content} style={styles.content} />
            ) : null}
          </View>
        ) : null}
      </View>
    </SurfaceCard>
  );
}

function buildMediaItems(
  card: PortfolioCardDTO,
  title: string,
  sourceLabel: string,
): FeedMediaItem[] {
  const items: FeedMediaItem[] = [];
  const seen = new Set<string>();
  const add = (item: FeedMediaItem, key?: string) => {
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    items.push(item);
  };

  const primaryImage = card.imageUrl ?? card.thumbUrl;
  if (primaryImage) {
    add(
      {
        id: "primary-image",
        kind: "image",
        uri: primaryImage,
        previewUri: card.thumbUrl,
        label: title || `${sourceLabel} 첨부 이미지`,
        detail: null,
      },
      primaryImage,
    );
  }

  for (const attachment of [...card.attachments].sort(
    (a, b) => a.order - b.order,
  )) {
    const label = attachment.fileName?.trim() || "첨부 파일";
    const detail = attachment.mimeType || "파일 첨부";
    if (attachment.kind === "image") {
      add(
        {
          id: attachment.id,
          kind: "image",
          uri: attachment.url,
          previewUri: attachment.previewUrl,
          label: label === "첨부 파일" ? `${sourceLabel} 첨부 이미지` : label,
          detail: null,
        },
        attachment.url,
      );
    } else if (attachment.kind === "video") {
      add(
        {
          id: attachment.id,
          kind: "video",
          uri: attachment.url,
          previewUri: attachment.previewUrl,
          label: label === "첨부 파일" ? "동영상 첨부" : label,
          detail,
        },
        attachment.url,
      );
    } else if (attachment.kind === "link") {
      add(
        {
          id: attachment.id,
          kind: "link",
          uri: attachment.url,
          previewUri: attachment.previewUrl,
          label: label === "첨부 파일" ? "링크 첨부" : label,
          detail: attachment.url,
        },
        attachment.url,
      );
    } else {
      add(
        {
          id: attachment.id,
          kind: "file",
          uri: attachment.url,
          previewUri: attachment.previewUrl,
          label,
          detail,
        },
        attachment.url,
      );
    }
  }

  if (card.videoUrl) {
    add(
      {
        id: "legacy-video",
        kind: "video",
        uri: card.videoUrl,
        previewUri: null,
        label: "동영상 첨부",
        detail: "재생 가능한 동영상",
      },
      card.videoUrl,
    );
  }
  if (card.fileUrl) {
    add(
      {
        id: "legacy-file",
        kind: "file",
        uri: card.fileUrl,
        previewUri: null,
        label: card.fileName?.trim() || "첨부 파일",
        detail: card.fileMimeType || "파일 첨부",
      },
      card.fileUrl,
    );
  }
  if (card.linkUrl) {
    add(
      {
        id: "link",
        kind: "link",
        uri: card.linkUrl,
        previewUri: card.linkImage,
        label: card.linkTitle?.trim() || "링크 첨부",
        detail: card.linkDesc?.trim() || card.linkUrl,
      },
      card.linkUrl,
    );
  }

  if (items.length === 0) {
    add({
      id: "text",
      kind: "text",
      uri: null,
      previewUri: null,
      label: title || "텍스트 게시물",
      detail: null,
    });
  }
  return items;
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
    maxWidth: parent.contentCardMinWidth * 2 - spacing.lg,
    alignSelf: "center",
    overflow: "hidden",
    borderRadius: radii.none,
    borderWidth: borders.none,
    boxShadow: "none",
  },
  cardNarrow: {
    borderLeftWidth: borders.none,
    borderRightWidth: borders.none,
  },
  cardHighlighted: {
    borderWidth: borders.medium,
    borderColor: colors.accent,
  },
  header: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  avatar: {
    width: spacing.xxl,
    height: spacing.xxl,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentTintedBg,
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
  avatarText: { ...typography.label, color: colors.accentTintedText },
  headerCopy: { flex: 1, minWidth: 0 },
  author: { ...typography.label, color: colors.text },
  source: { ...typography.micro, color: colors.textMuted },
  date: { ...typography.micro, color: colors.textFaint },
  media: {
    position: "relative",
    width: "100%",
    aspectRatio: media.previewAspectRatio,
    backgroundColor: colors.bgAlt,
    borderTopWidth: borders.hairline,
    borderBottomWidth: borders.hairline,
    borderColor: colors.border,
  },
  mediaPager: { flex: 1 },
  mediaPagerContent: { flexGrow: 1 },
  mediaPage: { width: "100%", height: "100%" },
  image: { width: "100%", height: "100%" },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.accentTintedBg,
  },
  fallbackEmoji: { fontSize: iconSizes.xl },
  fallbackText: { ...typography.body, color: colors.accentTintedText },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.overlay,
  },
  playText: { ...typography.section, color: colors.onAccent },
  attachmentBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
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
  attachmentPage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
  },
  linkPage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
  },
  linkImage: { width: "100%", height: "55%", marginBottom: spacing.sm },
  attachmentEmoji: { fontSize: iconSizes.xl },
  attachmentTitle: {
    ...typography.section,
    color: colors.text,
    textAlign: "center",
  },
  attachmentDetail: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  body: { gap: spacing.sm, padding: spacing.sm },
  counts: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  countText: {
    ...typography.label,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  caption: { gap: spacing.xxs },
  title: { ...typography.section, color: colors.text },
  content: { ...typography.body, color: colors.text },
});
