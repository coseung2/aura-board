import { useState } from "react";
import type { GestureResponderEvent } from "react-native";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, radii, shadows, spacing, typography } from "../theme/tokens";
import type { BoardCard } from "../lib/types";

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
  const authorName = resolveAuthorName(card);
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
          <Pressable
            onPress={(event) => openUrl(event, card.linkUrl)}
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
          </Pressable>
        ) : null}

        {card.videoUrl ? (
          <Pressable
            onPress={(event) => openUrl(event, card.videoUrl)}
            style={styles.videoBox}
            accessibilityRole="link"
          >
            <Text style={styles.videoLabel}>▶ 영상 열기</Text>
          </Pressable>
        ) : null}

        {fileUrl ? (
          <Pressable
            onPress={(event) => openUrl(event, fileUrl)}
            style={styles.fileBox}
            accessibilityRole="link"
          >
            <Text style={styles.fileIcon}>📎</Text>
            <Text style={styles.fileName} numberOfLines={1}>
              {fileName ?? "파일 열기"}
            </Text>
          </Pressable>
        ) : null}

        {(authorName || dateText) && (
          <View style={styles.authorFooter}>
            {authorName ? (
              <View style={styles.authorChip}>
                <Text style={styles.authorName} numberOfLines={1}>
                  {authorName}
                </Text>
              </View>
            ) : null}
            {dateText ? (
              <Text style={styles.authorTime}>{dateText}</Text>
            ) : null}
          </View>
        )}

        <View style={styles.engagement}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>♡ {likeCount}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>💬 {commentCount}</Text>
          </View>
        </View>
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor },
          pressed && styles.cardPressed,
        ]}
        onPress={onPress}
        accessibilityRole="button"
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor }]}>
      {body}
    </View>
  );
}

function openUrl(event: GestureResponderEvent, url: string | null | undefined) {
  event.stopPropagation();
  if (url) Linking.openURL(url);
}

function resolveAuthorName(card: BoardCard): string | null {
  if (card.authors && card.authors.length > 0) {
    const visible = card.authors.slice(0, 3).map((author) => author.displayName);
    const suffix = card.authors.length > 3 ? ` 외 ${card.authors.length - 3}명` : "";
    return visible.join(", ") + suffix;
  }
  return card.externalAuthorName ?? card.studentAuthorName ?? card.authorName ?? null;
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
    borderRadius: radii.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardPressed: {
    borderColor: colors.borderHover,
    ...shadows.cardHover,
  },
  image: {
    width: "100%",
    height: 160,
    backgroundColor: colors.surfaceAlt,
  },
  imageFallback: {
    width: "100%",
    height: 160,
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
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    color: colors.text,
  },
  content: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  linkBox: {
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 2,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fileIcon: { fontSize: 16 },
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
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  authorChip: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: 120,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.accentTintedBg,
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
    gap: 6,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: {
    ...typography.badge,
    color: colors.textMuted,
  },
});
