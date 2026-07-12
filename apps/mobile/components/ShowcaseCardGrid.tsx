import { Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  borders,
  colors,
  dashboard,
  layout as layoutTokens,
  layers,
  media,
  radii,
  shadows,
  sizing,
  spacing,
  typography,
} from "../theme/tokens";
import type { PortfolioCardDTO, ShowcaseEntryDTO } from "../lib/types";
import { Pill, SurfaceCard, SurfacePressable } from "./ui";

type Props = {
  entries: ShowcaseEntryDTO[];
  emptyText: string;
  onOpen: (entry: ShowcaseEntryDTO) => void;
};

export function ShowcaseCardGrid({ entries, emptyText, onOpen }: Props) {
  const { width, height } = useWindowDimensions();
  const columns = width > height ? 4 : 2;
  const horizontalPadding =
    width >= layoutTokens.mobileBreakpoint ? spacing.xxl : spacing.xl;
  const gridWidth = Math.max(
    Math.min(width, layoutTokens.readableMaxWidth) - horizontalPadding * 2,
    0,
  );
  const cardWidth = Math.max(
    1,
    Math.floor(
      (gridWidth - layoutTokens.boardGridGap * (columns - 1)) / columns,
    ),
  );

  if (entries.length === 0) {
    return (
      <SurfaceCard style={styles.emptyBox}>
        <Text style={styles.muted}>{emptyText}</Text>
      </SurfaceCard>
    );
  }

  return (
    <View style={styles.grid}>
      {entries.map((entry) => (
        <SurfacePressable
          key={`${entry.cardId}:${entry.studentId}`}
          style={[styles.card, { width: cardWidth, minHeight: cardWidth }]}
          onPress={() => onOpen(entry)}
        >
          <ShowcasePreview entry={entry} />
        </SurfacePressable>
      ))}
    </View>
  );
}

function ShowcasePreview({ entry }: { entry: ShowcaseEntryDTO }) {
  const card = entry.card;
  const image = getCardPreviewImage(card);
  const authorLabel = card.sourceBoard.anonymousAuthor ? "익명" : entry.studentName;
  return (
    <>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>🌟</Text>
      </View>
      <View style={styles.preview}>
        {image ? <Image source={{ uri: image }} style={styles.previewImage} /> : null}
        {card.videoUrl ? (
          <View style={styles.play}>
            <Text style={styles.playText}>▶</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {card.title || "제목 없음"}
        </Text>
        {card.content ? (
          <Text style={styles.cardContent} numberOfLines={3}>
            {card.content}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <Pill
            tone="accent"
            numberOfLines={1}
            style={styles.author}
            textStyle={styles.authorText}
          >
            {authorLabel}
          </Pill>
          <Text style={styles.date}>{formatShortDate(card.createdAt)}</Text>
        </View>
      </View>
    </>
  );
}

function getCardPreviewImage(card: PortfolioCardDTO): string | null {
  if (card.thumbUrl) return card.thumbUrl;
  if (card.imageUrl) return card.imageUrl;
  if (card.linkImage) return card.linkImage;
  const imageAttachment = card.attachments?.find(
    (a) => a.kind === "image" && (a.previewUrl || a.url),
  );
  return imageAttachment?.previewUrl ?? imageAttachment?.url ?? null;
}

function formatShortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: layoutTokens.boardGridGap,
    rowGap: layoutTokens.boardGridGap,
  },
  card: {
    overflow: "hidden",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    zIndex: layers.badge,
    width: dashboard.badgeSize,
    height: dashboard.badgeSize,
    borderRadius: radii.pill,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { ...typography.badge },
  preview: {
    aspectRatio: media.previewAspectRatio,
    backgroundColor: colors.bgAlt,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  previewImage: { width: "100%", height: "100%" },
  play: {
    position: "absolute",
    width: spacing.xxl,
    height: spacing.xxl,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  playText: { ...typography.section, color: colors.text, marginLeft: media.playOffset },
  body: { padding: spacing.sm, gap: spacing.xs },
  cardTitle: { ...typography.section, color: colors.text },
  cardContent: { ...typography.body, color: colors.textMuted },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  author: {
    maxWidth: sizing.authorChipMaxWidth,
  },
  authorText: { ...typography.badge, color: colors.accentTintedText },
  date: { ...typography.micro, color: colors.textMuted },
  emptyBox: {
    padding: spacing.xl,
  },
  muted: { ...typography.body, color: colors.textMuted },
});
