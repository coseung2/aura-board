import { Image, StyleSheet, Text, View } from "react-native";
import {
  borders,
  colors,
  dj,
  iconSizes,
  media,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import { buildMediaItems, findPlayableMediaUrl } from "../../lib/media";
import type { BoardCard } from "../../lib/types";
import { EmbeddedMedia } from "../EmbeddedMedia";
import { AppButton } from "../ui";
import { resolveQueueAuthorName } from "./dj-queue-state";

export function DJNowPlayingCard({
  card,
  compact,
  canControl,
  onNext,
}: {
  card: BoardCard;
  compact: boolean;
  canControl: boolean;
  onNext: () => void;
}) {
  const submitter = resolveQueueAuthorName(card);
  const mediaUrl = getNowPlayingMediaUrl(card);

  return (
    <View style={styles.now}>
      <Text style={styles.nowLabel}>▶ NOW PLAYING</Text>
      <View style={[styles.nowBody, compact && styles.nowBodyCompact]}>
        {mediaUrl ? (
          <View style={[styles.nowPlayer, compact && styles.nowPlayerCompact]}>
            <EmbeddedMedia
              url={mediaUrl}
              title={card.title}
              aspectRatio={dj.mediaAspectRatio}
            />
          </View>
        ) : card.linkImage ? (
          <Image
            source={{ uri: card.linkImage }}
            style={styles.nowThumb}
            resizeMode="cover"
            accessibilityLabel={`${card.title} 미리보기`}
          />
        ) : (
          <View style={[styles.nowThumb, styles.nowThumbFallback]}>
            <Text style={styles.nowThumbEmoji}>♪</Text>
          </View>
        )}
        <View style={styles.nowInfo}>
          <Text style={styles.nowTitle} numberOfLines={2}>
            {card.title}
          </Text>
          <Text style={styles.nowMeta}>
            {card.linkDesc ? `${card.linkDesc} · ` : ""}
            {submitter ? `${submitter}님 신청` : ""}
          </Text>
          {canControl ? (
            <View style={styles.nowActions}>
              <AppButton variant="secondary" onPress={onNext}>
                ⏭ 다음 곡
              </AppButton>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function getNowPlayingMediaUrl(card: BoardCard): string | null {
  const playableUrl = findPlayableMediaUrl(card);
  if (playableUrl) return playableUrl;
  const mediaItem = buildMediaItems(card).find(
    (item) => item.kind === "video" || item.kind === "link",
  );
  return mediaItem?.url ?? card.videoUrl ?? card.linkUrl ?? null;
}

const styles = StyleSheet.create({
  now: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  nowLabel: { ...typography.badge, color: colors.accent },
  nowBody: {
    flexDirection: "row",
    gap: spacing.lg,
    alignItems: "center",
  },
  nowBodyCompact: { flexDirection: "column", alignItems: "stretch" },
  nowPlayer: {
    width: dj.nowPlayerWidth,
    maxWidth: dj.nowPlayerMaxWidth,
    borderRadius: radii.control,
    overflow: "hidden",
  },
  nowPlayerCompact: {
    width: dj.nowPlayerCompactWidth,
    maxWidth: dj.nowPlayerCompactMaxWidth,
  },
  nowThumb: {
    width: dj.nowThumbWidth,
    height: dj.nowThumbHeight,
    borderRadius: radii.control,
    backgroundColor: colors.mediaLilacDark,
  },
  nowThumbFallback: { alignItems: "center", justifyContent: "center" },
  nowThumbEmoji: { fontSize: iconSizes.xl, color: colors.onAccent },
  nowInfo: { flex: 1, minWidth: 0 },
  nowTitle: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  nowMeta: { ...typography.body, color: colors.textMuted },
  nowActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: "wrap",
  },
});
