import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ban, CircleAlert, Pencil, Trash2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { anchoredOverlayLayout } from "../lib/overlay-layout";
import type { BoardCard } from "../lib/types";
import { resolveCardAuthorName } from "../lib/card-privacy";
import { apiFetch } from "../lib/api";
import { hideContent, reportContent } from "../lib/content-safety";
import { buildMediaItems, mediaPreviewUrls } from "../lib/media";
import {
  borders,
  colors,
  iconSizes,
  radii,
  shadows,
  spacing,
  tapMin,
  typography,
} from "../theme/tokens";
import { AppOverlayModal, BarePressable, ControlPressable } from "./ui";

export type PostAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Props = {
  card: BoardCard;
  anchor: PostAnchor;
  onClose: () => void;
  onHidden: (cardId: string) => void;
  mode?: "moderation" | "owner";
  onEdit?: () => void;
  onDeleted?: (cardId: string) => void;
};

/** Full-screen focus layer for hiding or reporting another student's post. */
export function PostModerationOverlay({
  card,
  anchor,
  onClose,
  onHidden,
  mode = "moderation",
  onEdit,
  onDeleted,
}: Props) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const author = resolveCardAuthorName(card) || "작성자";
  const preview = mediaPreviewUrls(buildMediaItems(card))[0] ?? null;
  const [actionHeight, setActionHeight] = useState((tapMin + spacing.lg) * 2 * window.fontScale);
  const geometry = anchoredOverlayLayout(window, insets, anchor, actionHeight, true);
  const menuWidth = Math.min(geometry.width, (tapMin * 4 + spacing.sm) * window.fontScale);
  const authorStudentId =
    card.studentAuthorId ??
    card.authors?.find((item) => Boolean(item.studentId))?.studentId ??
    null;

  async function hidePost() {
    if (busy) return;
    setBusy(true);
    try {
      await hideContent({ targetKind: "card", targetId: card.id });
      onHidden(card.id);
      onClose();
    } catch {
      Alert.alert("숨기기 실패", "게시글을 숨기지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function deletePost() {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/cards/${encodeURIComponent(card.id)}`, {
        method: "DELETE",
      });
      onDeleted?.(card.id);
      onClose();
    } catch {
      Alert.alert(
        "삭제 실패",
        "게시글을 삭제하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      "게시글 삭제",
      "이 게시글을 삭제할까요? 삭제하면 되돌릴 수 없어요.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () => void deletePost(),
        },
      ],
    );
  }

  function confirmReport() {
    Alert.alert(
      "게시글 신고",
      authorStudentId
        ? "이 게시글을 신고하고 작성자를 차단할까요?"
        : "이 게시글을 신고할까요?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "신고",
          style: "destructive",
          onPress: () => {
            if (busy) return;
            setBusy(true);
            void reportContent({
              targetKind: "card",
              targetId: card.id,
              reason: "other",
              hideAuthor: Boolean(authorStudentId),
            })
              .then(() => {
                onHidden(card.id);
                onClose();
                Alert.alert("신고 완료", "선생님에게 신고를 보냈어요.");
              })
              .catch(() => {
                Alert.alert("신고 실패", "신고를 보내지 못했어요.");
              })
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }

  return (
    <AppOverlayModal visible onClose={onClose}>
      <View style={styles.root} accessibilityViewIsModal>
        <BarePressable
          style={styles.backdrop}
          onPress={busy ? undefined : onClose}
          accessibilityLabel="게시글 관리 메뉴 닫기"
        />
        <View style={[styles.focusWrap, { left: geometry.left, top: geometry.top, width: geometry.width, gap: geometry.gap }]}>
          {geometry.previewHeight > 0 ? <View style={[styles.post, { height: geometry.previewHeight }]}>
            <Text style={styles.author} numberOfLines={1}>
              {author}
            </Text>
            {preview ? (
              <Image
                source={{ uri: preview }}
                style={styles.preview}
                contentFit="cover"
              />
            ) : null}
            {card.title.trim() ? (
              <Text style={styles.title} numberOfLines={2}>
                {card.title.trim()}
              </Text>
            ) : null}
            {card.content.trim() ? (
              <Text style={styles.content} numberOfLines={preview ? 3 : 7}>
                {card.content.trim()}
              </Text>
            ) : null}
          </View> : null}

          <ScrollView
            style={[styles.actions, { height: geometry.actionsHeight, width: menuWidth }]}
            onContentSizeChange={(_width, height) => setActionHeight(height + borders.hairline * 2)}
            keyboardShouldPersistTaps="handled"
            accessibilityLabel="게시글 관리 메뉴"
          >
            {mode === "owner" ? (
              <>
                <ControlPressable
                  style={styles.action}
                  onPress={() => {
                    onClose();
                    onEdit?.();
                  }}
                  disabled={busy || !onEdit}
                  accessibilityLabel="게시글 수정"
                >
                  <Pencil
                    size={iconSizes.lg}
                    color={colors.textMuted}
                    strokeWidth={1.75}
                    accessible={false}
                  />
                  <Text style={styles.actionLabel}>수정</Text>
                </ControlPressable>
                <ControlPressable
                  style={[styles.action, styles.actionLast]}
                  onPress={confirmDelete}
                  disabled={busy || !onDeleted}
                  accessibilityLabel="게시글 삭제"
                >
                  <Trash2
                    size={iconSizes.lg}
                    color={colors.danger}
                    strokeWidth={1.75}
                    accessible={false}
                  />
                  <Text style={[styles.actionLabel, styles.reportLabel]}>
                    삭제
                  </Text>
                </ControlPressable>
              </>
            ) : (
              <>
                <ControlPressable
                  style={styles.action}
                  onPress={() => void hidePost()}
                  disabled={busy}
                  accessibilityLabel="게시글 숨기기"
                >
                  <Ban
                    size={iconSizes.lg}
                    color={colors.textMuted}
                    strokeWidth={1.75}
                    accessible={false}
                  />
                  <Text style={styles.actionLabel}>숨기기</Text>
                </ControlPressable>
                <ControlPressable
                  style={[styles.action, styles.actionLast]}
                  onPress={confirmReport}
                  disabled={busy}
                  accessibilityLabel="게시글 신고"
                >
                  <CircleAlert
                    size={iconSizes.lg}
                    color={colors.danger}
                    strokeWidth={1.75}
                    accessible={false}
                  />
                  <Text style={[styles.actionLabel, styles.reportLabel]}>
                    신고
                  </Text>
                </ControlPressable>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </AppOverlayModal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.modalBackdrop,
  },
  focusWrap: { position: "absolute", gap: spacing.sm },
  post: {
    overflow: "hidden",
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  author: { ...typography.label, color: colors.text },
  preview: {
    width: "100%",
    flex: 1,
    minHeight: tapMin,
    borderRadius: radii.control,
    backgroundColor: colors.surfaceAlt,
  },
  title: { ...typography.subtitle, color: colors.text },
  content: { ...typography.body, color: colors.text },
  actions: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "flex-start",
    overflow: "hidden",
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  action: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: borders.none,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
    borderRadius: radii.none,
    backgroundColor: colors.surface,
  },
  actionLabel: { ...typography.body, color: colors.text, fontWeight: "600", flexShrink: 1 },
  reportLabel: { color: colors.danger },
  actionLast: { borderBottomWidth: borders.none },
});
