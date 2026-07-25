import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ban, CircleAlert, Heart } from "lucide-react-native";
import { BarePressable, ControlPressable } from "./ui";
import {
  borders,
  colors,
  iconSizes,
  layers,
  radii,
  shadows,
  spacing,
  tapMin,
  typography,
} from "../theme/tokens";

export type CommentAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Props = {
  anchor: CommentAnchor;
  authorLabel: string;
  dateLabel: string;
  content: string;
  likeCount: number;
  onClose: () => void;
  onHide: () => void;
  onReport: () => void;
};

const SCREEN_MARGIN = spacing.lg;
const ACTION_PANEL_HEIGHT = tapMin * 2 + spacing.sm;

/** Full-screen focus layer used after a long press on a comment. */
export function CommentModerationOverlay({
  anchor,
  authorLabel,
  dateLabel,
  content,
  likeCount,
  onClose,
  onHide,
  onReport,
}: Props) {
  const window = useWindowDimensions();
  const width = Math.min(anchor.width, window.width - SCREEN_MARGIN * 2);
  const left = Math.max(
    SCREEN_MARGIN,
    Math.min(anchor.x, window.width - width - SCREEN_MARGIN),
  );
  const maxTop =
    window.height -
    SCREEN_MARGIN -
    ACTION_PANEL_HEIGHT -
    spacing.sm -
    anchor.height;
  const top = Math.max(SCREEN_MARGIN, Math.min(anchor.y, maxTop));

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <BarePressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="댓글 관리 메뉴 닫기"
      />
      <View style={[styles.focusWrap, { left, top, width }]}>
        <View style={styles.commentCard}>
          <View style={styles.commentRow}>
            <View style={styles.commentCopy}>
              <View style={styles.identity}>
                <Text style={styles.author} numberOfLines={1}>
                  {authorLabel || "작성자"}
                </Text>
                {dateLabel ? <Text style={styles.date}>{dateLabel}</Text> : null}
              </View>
              <Text style={styles.content}>{content}</Text>
            </View>
            <View style={styles.like} accessible accessibilityLabel={`좋아요 ${likeCount}`}>
              <Heart
                size={iconSizes.md}
                color={colors.textMuted}
                strokeWidth={1.75}
                accessible={false}
              />
              <Text style={styles.likeCount}>{likeCount}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actions} accessibilityLabel="댓글 관리 메뉴">
          <ControlPressable
            style={styles.action}
            onPress={onHide}
            accessibilityLabel="댓글 숨기기"
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
            onPress={onReport}
            accessibilityLabel="댓글 신고"
          >
            <CircleAlert
              size={iconSizes.lg}
              color={colors.danger}
              strokeWidth={1.75}
              accessible={false}
            />
            <Text style={[styles.actionLabel, styles.reportLabel]}>신고</Text>
          </ControlPressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: layers.floatingPopover,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.modalBackdrop,
  },
  focusWrap: {
    position: "absolute",
    gap: spacing.sm,
  },
  commentCard: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  commentCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  author: {
    ...typography.label,
    color: colors.text,
    flexShrink: 1,
  },
  date: {
    ...typography.micro,
    color: colors.textMuted,
  },
  content: {
    ...typography.body,
    color: colors.text,
  },
  like: {
    minWidth: tapMin,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
  },
  likeCount: {
    ...typography.micro,
    color: colors.textMuted,
  },
  actions: {
    alignSelf: "flex-start",
    minWidth: 184,
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
  actionLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: "600",
  },
  reportLabel: {
    color: colors.danger,
  },
  actionLast: {
    borderBottomWidth: borders.none,
  },
});
