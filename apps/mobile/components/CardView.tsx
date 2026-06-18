import { useState } from "react";
import type { GestureResponderEvent } from "react-native";
import {
  Image,
  Linking,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  borders,
  colors,
  media,
  sizing,
  spacing,
  typography,
} from "../theme/tokens";
import type { BoardCard } from "../lib/types";
import { resolveCardAuthorName } from "../lib/card-privacy";
import { ControlPressable, Pill, SurfaceCard, SurfacePressable } from "./ui";

export function CardView({
  card,
  onPress,
}: {
  card: BoardCard;
  onPress?: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const firstImage =
    card.imageUrl ??
    card.attachments?.find((attachment) => attachment.kind === "image")?.url ??
    card.linkImage ??
    null;
  const authorName = resolveCardAuthorName(card);
  const dateText = formatCardDate(card.createdAt);
  const fileUrl = card.fileUrl ?? card.attachments?.find((attachment) => attachment.kind === "file")?.url;
  const fileName = card.fileName ?? card.attachments?.find((attachment) => attachment.kind === "file")?.fileName;
  const hasImageFallback = Boolean(firstImage && imageFailed);
  const backgroundColor = card.color ?? colors.surface;
  const likeCount = card.likeCount ?? 0;
  const commentCount = card.commentCount ?? 0;

  const body = (
    <>
      {firstImage && !imageFailed ? (
        <Image
          source={{ uri: firstImage }}
          style={styles.image}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : hasImageFallback ? (
        <View style={styles.imageFallback}>
          <Text style={styles.imageFallbackText}>이미지를 불러올 수 없어요</Text>
        </View>
      ) : null}

      <View style={styles.body}>
        {card.title ? (
          <Text style={styles.title} numberOfLines={3}>
            {card.title}
          </Text>
        ) : null}
        {card.content ? (
          <Text style={styles.content} numberOfLines={6}>
            {card.content}
          </Text>
        ) : null}

        {card.linkUrl ? (
          <ControlPressable
            onPress={(event) => openInlineTarget(event, card.linkUrl, onPress)}
            style={styles.linkBox}
            accessibilityRole="link"
          >
            <Text style={styles.linkHost} numberOfLines={1}>
              {safeHost(card.linkUrl)}
            </Text>
            <Text style={styles.linkTitle} numberOfLines={2}>
              {card.linkTitle ?? card.linkUrl}
            </Text>
            {card.linkDesc ? (
              <Text style={styles.linkDesc} numberOfLines={2}>
                {card.linkDesc}
              </Text>
            ) : null}
          </ControlPressable>
        ) : null}

        {card.videoUrl ? (
          <ControlPressable
            onPress={(event) => openInlineTarget(event, card.videoUrl, onPress)}
            style={styles.videoBox}
            accessibilityRole="link"
          >
            <Text style={styles.videoLabel}>▶ 영상 열기</Text>
          </ControlPressable>
        ) : null}

        {fileUrl ? (
          <ControlPressable
            onPress={(event) => openInlineTarget(event, fileUrl, onPress)}
            style={styles.fileBox}
            accessibilityRole="link"
          >
            <Text style={styles.fileIcon}>📎</Text>
            <Text style={styles.fileName} numberOfLines={1}>
              {fileName ?? "파일 열기"}
            </Text>
          </ControlPressable>
        ) : null}

        {(authorName || dateText) && (
          <View style={styles.authorFooter}>
            {authorName ? (
              <Pill
                tone="accent"
                numberOfLines={1}
                style={styles.authorChip}
                textStyle={styles.authorName}
              >
                {authorName}
              </Pill>
            ) : null}
            {dateText ? (
              <Text style={styles.authorTime}>{dateText}</Text>
            ) : null}
          </View>
        )}

        <View style={styles.engagement}>
          <Pill textStyle={styles.chipText}>♡ {likeCount}</Pill>
          <Pill textStyle={styles.chipText}>💬 {commentCount}</Pill>
        </View>
      </View>
    </>
  );

  if (onPress) {
    return (
      <SurfacePressable
        style={[styles.card, { backgroundColor }]}
        onPress={onPress}
      >
        {body}
      </SurfacePressable>
    );
  }

  return (
    <SurfaceCard style={[styles.card, { backgroundColor }]}>
      {body}
    </SurfaceCard>
  );
}

function openInlineTarget(
  event: GestureResponderEvent,
  url: string | null | undefined,
  onPress?: () => void,
) {
  event.stopPropagation();
  if (onPress) {
    onPress();
    return;
  }
  if (url) void openExternalUrl(url);
}

async function openExternalUrl(url: string) {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    }
  } catch {
    // Ignore malformed or unsupported external targets from legacy cards.
  }
}

function formatCardDate(iso: string | Date | null | undefined): string | null {
  if (!iso) return null;
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}. ${month}. ${day}.`;
}

function safeHost(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: media.cardImageHeight,
    backgroundColor: colors.surfaceAlt,
  },
  imageFallback: {
    width: "100%",
    height: media.cardImageHeight,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  imageFallbackText: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: "center",
  },
  body: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: {
    ...typography.subtitle,
    color: colors.text,
  },
  content: {
    ...typography.micro,
    color: colors.textMuted,
  },
  linkBox: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  linkHost: {
    ...typography.micro,
    color: colors.accentTintedText,
  },
  linkTitle: {
    ...typography.label,
    color: colors.text,
  },
  linkDesc: {
    ...typography.micro,
    color: colors.textMuted,
  },
  videoBox: {
    padding: spacing.sm,
    alignItems: "center",
  },
  videoLabel: {
    ...typography.label,
    color: colors.text,
  },
  fileBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
  },
  fileIcon: { ...typography.label },
  fileName: {
    ...typography.label,
    color: colors.text,
    flex: 1,
  },
  authorFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  authorChip: {
    maxWidth: sizing.authorChipMaxWidth,
  },
  authorName: {
    ...typography.micro,
    color: colors.accentTintedText,
  },
  authorTime: {
    ...typography.micro,
    color: colors.textMuted,
  },
  engagement: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  chipText: {
    ...typography.badge,
    color: colors.textMuted,
  },
});
