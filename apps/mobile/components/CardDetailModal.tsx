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

interface Props {
  card: BoardCard | null;
  onClose: () => void;
}

// 카드 상세 모달. 탭한 카드의 전체 내용을 보여줌.
export function CardDetailModal({ card, onClose }: Props) {
  if (!card) return null;

  const firstImage =
    card.imageUrl ??
    card.attachments?.find((a) => a.kind === "image")?.url ??
    card.linkImage ??
    null;
  const authorName = card.authors?.[0]?.displayName ?? card.externalAuthorName;
  const hasLink = Boolean(card.linkUrl);
  const hasVideo = Boolean(card.videoUrl);
  const fileUrl = card.fileUrl ?? card.attachments?.find((a) => a.kind === "file")?.url;
  const fileName = card.fileName ?? card.attachments?.find((a) => a.kind === "file")?.fileName;

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
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            카드 상세
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {firstImage ? (
            <Image
              source={{ uri: firstImage }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : null}

          {card.title ? (
            <Text style={styles.title}>{card.title}</Text>
          ) : null}

          {card.content ? (
            <Text style={styles.content}>{card.content}</Text>
          ) : (
            <Text style={styles.contentEmpty}>본문이 없습니다.</Text>
          )}

          {hasLink ? (
            <Pressable
              onPress={() => card.linkUrl && Linking.openURL(card.linkUrl)}
              style={styles.linkBox}
            >
              <Text style={styles.linkHost} numberOfLines={1}>
                {safeHost(card.linkUrl)}
              </Text>
              <Text style={styles.linkTitle}>{card.linkTitle ?? card.linkUrl}</Text>
              {card.linkDesc ? (
                <Text style={styles.linkDesc}>{card.linkDesc}</Text>
              ) : null}
            </Pressable>
          ) : null}

          {hasVideo ? (
            <Pressable
              onPress={() => card.videoUrl && Linking.openURL(card.videoUrl)}
              style={styles.videoBox}
            >
              <Text style={styles.videoLabel}>▶ 영상 열기</Text>
            </Pressable>
          ) : null}

          {fileUrl ? (
            <Pressable
              onPress={() => Linking.openURL(fileUrl)}
              style={styles.fileBox}
            >
              <Text style={styles.fileIcon}>📎</Text>
              <Text style={styles.fileName} numberOfLines={1}>
                {fileName ?? "파일 열기"}
              </Text>
            </Pressable>
          ) : null}

          {authorName ? (
            <Text style={styles.author}>— {authorName}</Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
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
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
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
  closeText: {
    fontSize: 18,
    color: colors.textMuted,
  },
  headerTitle: {
    ...typography.section,
    color: colors.text,
    flex: 1,
    textAlign: "center",
    marginHorizontal: spacing.md,
  },
  headerSpacer: {
    width: 36,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  image: {
    width: "100%",
    height: 220,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  content: {
    ...typography.body,
    color: colors.text,
    lineHeight: 24,
  },
  contentEmpty: {
    ...typography.body,
    color: colors.textFaint,
  },
  author: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  linkBox: {
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.accentTintedBg,
    gap: 4,
    ...shadows.card,
  },
  linkHost: {
    ...typography.micro,
    color: colors.accentTintedText,
  },
  linkTitle: {
    ...typography.subtitle,
    color: colors.text,
  },
  linkDesc: {
    ...typography.body,
    color: colors.textMuted,
  },
  videoBox: {
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
  },
  videoLabel: {
    ...typography.subtitle,
    color: colors.text,
  },
  fileBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fileIcon: { fontSize: 18 },
  fileName: {
    ...typography.label,
    color: colors.text,
    flex: 1,
  },
});
