import { StyleSheet } from "react-native";
import { borders } from "../../theme/tokens";
import { colors } from "../../theme/tokens";
import { controls } from "../../theme/tokens";
import { layout } from "../../theme/tokens";
import { pageChrome } from "../../theme/tokens";
import { radii } from "../../theme/tokens";
import { spacing } from "../../theme/tokens";
import { tapMin } from "../../theme/tokens";
import { typography } from "../../theme/tokens";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    alignSelf: "center",
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: pageChrome.directContentStartGap,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  composer: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  commentInput: {
    minHeight: controls.multilineInputMinHeight,
    textAlignVertical: "top",
  },
  submitButton: {
    alignSelf: "flex-start",
  },
  errorBlock: {
    gap: spacing.xs,
    alignItems: "flex-start",
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
  familyNoticeBlock: {
    width: "100%",
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  familyNoticeText: {
    color: colors.textMuted,
    textAlign: "center",
  },
  commentList: {
    gap: spacing.none,
  },
  thread: {
    gap: spacing.none,
  },
  commentItem: {
    minHeight: tapMin,
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  replyItem: {
    marginLeft: spacing.xl,
    paddingLeft: spacing.md,
    borderLeftWidth: borders.hairline,
    borderLeftColor: colors.border,
  },
  commentItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  commentTextBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  commentIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flex: 1,
  },
  commentAuthor: {
    ...typography.label,
    color: colors.text,
    flexShrink: 1,
  },
  commentDate: {
    ...typography.micro,
    color: colors.textMuted,
  },
  commentContent: {
    ...typography.body,
    color: colors.text,
  },
  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  commentAction: {
    minHeight: tapMin,
    justifyContent: "center",
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.xxs,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  replyLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  deleteLabel: {
    ...typography.micro,
    color: colors.danger,
  },
  replyComposer: {
    marginLeft: spacing.xl,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    gap: spacing.xs,
    borderLeftWidth: borders.hairline,
    borderLeftColor: colors.accent,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  replyTargetLabel: {
    ...typography.micro,
    color: colors.accentTintedText,
  },
  replyComposerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  replyInput: {
    flex: 1,
    minHeight: controls.inputHeight,
  },
  replySubmitButton: {
    minWidth: tapMin,
  },
  replyCancel: {
    alignSelf: "flex-start",
    minHeight: tapMin,
    justifyContent: "center",
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.none,
    borderWidth: borders.none,
    backgroundColor: colors.transparent,
  },
  replyCancelLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  // Placeholder that replaces a hidden comment in place.
  hiddenItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.surfaceAlt,
  },
  hiddenText: {
    ...typography.label,
    color: colors.textMuted,
    flex: 1,
  },
  hiddenAction: {
    minHeight: tapMin,
    justifyContent: "center",
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.xxs,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  hiddenActionLabel: {
    ...typography.micro,
    color: colors.accent,
  },
  emptyState: {
    alignItems: "flex-start",
    paddingVertical: spacing.xxxl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
  },
});
