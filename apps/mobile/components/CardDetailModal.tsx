import {
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, radii, shadows, spacing, typography } from "../theme/tokens";
import type { BoardCard } from "../lib/types";
import { EmbeddedMedia } from "./EmbeddedMedia";
import {
  buildMediaItems,
  fileAttachments,
  formatFileSize,
  isCanvaDesignUrl,
  isYouTubeVideoUrl,
  mediaAttachments,
  safeHost,
  type MediaItem,
} from "../lib/media";

interface Props {
  card: BoardCard | null;
  onClose: () => void;
}

export function CardDetailModal({ card, onClose }: Props) {
  if (!card) return null;

  const authorName = resolveAuthorName(card);
  const allItems = buildMediaItems({
    attachments: card.attachments,
    imageUrl: card.imageUrl,
    videoUrl: card.videoUrl,
    linkUrl: card.linkUrl,
    linkTitle: card.linkTitle,
    linkDesc: card.linkDesc,
    linkImage: card.linkImage,
    fileUrl: card.fileUrl,
    fileName: card.fileName,
    fileSize: card.fileSize,
    fileMimeType: card.fileMimeType,
  });
  const mediaItems = mediaAttachments(allItems);
  const fileItems = fileAttachments(allItems);
  const hasEmbeddableLink = Boolean(
    card.linkUrl &&
      (isYouTubeVideoUrl(card.linkUrl) || isCanvaDesignUrl(card.linkUrl)),
  );
  const hasTextLink = Boolean(card.linkUrl && !hasEmbeddableLink);

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>X</Text>
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            카드 상세
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {mediaItems.length > 0 ? (
            <View style={styles.mediaZone}>
              {mediaItems.map((item) => (
                <MediaBlock key={item.id} item={item} />
              ))}
            </View>
          ) : null}

          <View style={styles.contentZone}>
            {card.title.trim() ? <Text style={styles.title}>{card.title}</Text> : null}

            {hasTextLink && (card.linkTitle || card.linkDesc) ? (
              <View style={styles.linkBody}>
                {card.linkTitle ? (
                  <Text style={styles.linkTitle}>{card.linkTitle}</Text>
                ) : null}
                {card.linkDesc ? (
                  <Text style={styles.linkDesc}>{card.linkDesc}</Text>
                ) : null}
              </View>
            ) : null}

            {card.content.trim() ? (
              <Text style={styles.content}>{card.content}</Text>
            ) : mediaItems.length === 0 && fileItems.length === 0 && !hasTextLink ? (
              <Text style={styles.contentEmpty}>본문이 없습니다.</Text>
            ) : null}

            {fileItems.length > 0 ? (
              <View style={styles.fileList}>
                {fileItems.map((item) => (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [
                      styles.fileBox,
                      pressed && styles.fileBoxPressed,
                    ]}
                    onPress={() => Linking.openURL(item.url)}
                  >
                    <Text style={styles.fileIcon}>파일</Text>
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {item.fileName || "파일 열기"}
                      </Text>
                      {item.fileSize ? (
                        <Text style={styles.fileMeta}>
                          {formatFileSize(item.fileSize)}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {hasTextLink && card.linkUrl ? (
              <Pressable
                style={({ pressed }) => [
                  styles.externalLinkBtn,
                  pressed && styles.externalLinkBtnPressed,
                ]}
                onPress={() => Linking.openURL(card.linkUrl!)}
              >
                <Text style={styles.externalLinkText}>
                  {safeHost(card.linkUrl)} 열기
                </Text>
              </Pressable>
            ) : null}
          </View>

          {(authorName || card.createdAt) ? (
            <View style={styles.metaZone}>
              {authorName ? <Text style={styles.author}>작성자 {authorName}</Text> : null}
              <Text style={styles.date}>{formatCardDate(card.createdAt)}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function MediaBlock({ item }: { item: MediaItem }) {
  if (item.kind === "image") {
    return (
      <Image
        source={{ uri: item.previewUrl ?? item.url }}
        style={styles.image}
        resizeMode="cover"
      />
    );
  }
  if (item.kind === "video" || item.kind === "link") {
    return (
      <EmbeddedMedia
        url={item.url}
        title={item.fileName ?? undefined}
        style={styles.embed}
      />
    );
  }
  return null;
}

function resolveAuthorName(card: BoardCard): string | null {
  if (card.authors && card.authors.length > 0) {
    const visible = card.authors.slice(0, 3).map((author) => author.displayName);
    const suffix = card.authors.length > 3 ? ` 외 ${card.authors.length - 3}명` : "";
    return visible.join(", ") + suffix;
  }
  return card.externalAuthorName ?? card.studentAuthorName ?? card.authorName ?? null;
}

function formatCardDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  closeText: { fontSize: 16, color: colors.textMuted, fontWeight: "700" },
  headerTitle: {
    ...typography.section,
    color: colors.text,
    flex: 1,
    textAlign: "center",
    marginHorizontal: spacing.md,
  },
  headerSpacer: { width: 36 },
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  mediaZone: { gap: spacing.md },
  image: {
    width: "100%",
    height: 240,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  embed: { borderRadius: radii.card, backgroundColor: colors.surface },
  contentZone: { gap: spacing.md },
  title: { ...typography.title, color: colors.text },
  linkBody: { gap: spacing.xs },
  linkTitle: { ...typography.subtitle, color: colors.text },
  linkDesc: { ...typography.body, color: colors.textMuted },
  content: { ...typography.body, color: colors.text, lineHeight: 24 },
  contentEmpty: { ...typography.body, color: colors.textFaint },
  fileList: { gap: spacing.sm },
  fileBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  fileBoxPressed: { backgroundColor: colors.surfaceAlt },
  fileIcon: { ...typography.micro, color: colors.accent },
  fileInfo: { flex: 1, gap: 2 },
  fileName: { ...typography.label, color: colors.text },
  fileMeta: { ...typography.micro, color: colors.textFaint },
  externalLinkBtn: {
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.accentTintedBg,
    alignItems: "center",
  },
  externalLinkBtnPressed: { opacity: 0.7 },
  externalLinkText: { ...typography.label, color: colors.accentTintedText },
  metaZone: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  author: { ...typography.micro, color: colors.textMuted },
  date: { ...typography.micro, color: colors.textFaint },
});
