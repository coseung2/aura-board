import { Image, Linking, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Play } from "lucide-react-native";
import type { FeedItem, FeedMedia } from "../lib/feed";
import { youtubeThumbnailUrl } from "../lib/feed";
import { borders, colors, feed, iconSizes, radii, spacing, typography } from "../theme/tokens";
import { ControlPressable, SurfaceCard } from "./ui";

const AUTHOR_LABELS = {
  PLATFORM: "Aura 공식",
  TEACHER: "선생님",
  STUDENT: "학생",
} as const;

function formatPublishedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MediaTile({ media, width }: { media: FeedMedia; width: number }) {
  const youtubeThumb = youtubeThumbnailUrl(media);
  const imageSource = media.kind === "IMAGE" ? media.url : youtubeThumb;
  const tile = (
    <View style={[styles.mediaTile, { width }]}>
      {imageSource ? (
        <Image
          source={{ uri: imageSource }}
          style={styles.mediaImage}
          resizeMode="cover"
          accessibilityLabel={media.altText ?? (media.kind === "YOUTUBE" ? "YouTube 미리보기" : "피드 이미지")}
        />
      ) : (
        <View style={styles.mediaFallback}>
          <Text style={styles.mediaFallbackText}>YouTube</Text>
        </View>
      )}
      {media.kind === "YOUTUBE" ? (
        <View style={styles.playBadge} accessible={false}>
          <Play size={iconSizes.md} color={colors.surface} fill={colors.surface} />
        </View>
      ) : null}
    </View>
  );

  if (media.kind !== "YOUTUBE") return tile;
  return (
    <ControlPressable
      onPress={() => void Linking.openURL(media.url)}
      accessibilityRole="link"
      accessibilityLabel="YouTube에서 영상 열기"
    >
      {tile}
    </ControlPressable>
  );
}

export function FeedCard({ item }: { item: FeedItem }) {
  const { width } = useWindowDimensions();
  const mediaWidth = Math.min(420, Math.max(220, width - spacing.xxl * 2));

  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.authorBlock}>
          <View style={styles.authorRow}>
            <Text style={styles.authorName}>{item.authorDisplayName}</Text>
            <Text style={styles.authorKind}>{AUTHOR_LABELS[item.authorKind]}</Text>
          </View>
          <Text style={styles.timestamp}>{formatPublishedAt(item.publishedAt)}</Text>
        </View>
        <View style={styles.scopeBadge}>
          <Text style={styles.scopeText}>{item.scope === "GLOBAL" ? "전체" : "우리 반"}</Text>
        </View>
      </View>

      {item.media.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mediaRow}
          style={styles.mediaScroll}
          accessibilityLabel="게시물 미디어"
        >
          {item.media.map((media) => (
            <MediaTile key={media.id} media={media} width={mediaWidth} />
          ))}
        </ScrollView>
      ) : null}

      {item.title ? <Text style={styles.title} selectable>{item.title}</Text> : null}
      {item.body ? <Text style={styles.body} selectable>{item.body}</Text> : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  authorBlock: { flex: 1, minWidth: 0, gap: spacing.xxs },
  authorRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.xs },
  authorName: { ...typography.label, color: colors.text, flexShrink: 1 },
  authorKind: { ...typography.micro, color: colors.accent, fontWeight: "700" },
  timestamp: { ...typography.micro, color: colors.textMuted },
  scopeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: colors.accentTintedBg,
  },
  scopeText: { ...typography.micro, color: colors.textMuted, fontWeight: "700" },
  mediaScroll: { marginHorizontal: -spacing.lg },
  mediaRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  mediaTile: {
    height: feed.mediaHeight,
    borderRadius: radii.card,
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
    position: "relative",
  },
  mediaImage: { width: "100%", height: "100%" },
  mediaFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  mediaFallbackText: { ...typography.label, color: colors.textMuted },
  playBadge: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: feed.playButtonSize,
    height: feed.playButtonSize,
    marginLeft: -feed.playButtonSize / 2,
    marginTop: -feed.playButtonSize / 2,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.text,
  },
  title: { ...typography.section, color: colors.text },
  body: { ...typography.body, color: colors.text },
});
