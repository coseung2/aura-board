import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { EmbeddedMedia } from "./EmbeddedMedia";
import { borders, colors, media, radii, spacing, typography } from "../theme/tokens";
import type { ParentFeedPublicationDTO } from "../lib/types";

type Props = {
  item: ParentFeedPublicationDTO;
};

/** Developer/teacher feed publication rendered inside the parent feed. */
export function ParentPublicationCard({ item }: Props) {
  const date = new Date(item.publishedAt).toLocaleDateString("ko-KR");
  return (
    <View
      style={styles.card}
      accessible={false}
      accessibilityLabel={`${item.authorDisplayName}의 소식${
        item.title ? `, ${item.title}` : ""
      }`}
    >
      <View style={styles.metaRow}>
        <Text style={styles.author}>{item.authorDisplayName}</Text>
        <Text style={styles.date}>{date}</Text>
      </View>
      {item.title ? <Text style={styles.title}>{item.title}</Text> : null}
      {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
      {item.media.length ? (
        <View style={styles.mediaList}>
          {item.media.map((mediaItem) =>
            mediaItem.kind === "YOUTUBE" ? (
              <EmbeddedMedia
                key={mediaItem.id}
                url={mediaItem.url}
                title={item.title ?? mediaItem.altText ?? undefined}
                style={styles.mediaEmbed}
              />
            ) : (
              <Image
                key={mediaItem.id}
                source={{ uri: mediaItem.url }}
                style={styles.mediaImage}
                contentFit="cover"
                accessibilityLabel={mediaItem.altText ?? item.title ?? "게시물 이미지"}
              />
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  author: { ...typography.label, color: colors.accent, fontWeight: "700" },
  date: { ...typography.micro, color: colors.textMuted },
  title: { ...typography.section, color: colors.text },
  body: { ...typography.body, color: colors.text },
  mediaList: { gap: spacing.sm, marginTop: spacing.xs },
  mediaImage: {
    width: "100%",
    aspectRatio: media.previewAspectRatio,
    borderRadius: radii.control,
    backgroundColor: colors.surfaceAlt,
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
  mediaEmbed: {
    width: "100%",
    borderRadius: radii.control,
    overflow: "hidden",
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
});
