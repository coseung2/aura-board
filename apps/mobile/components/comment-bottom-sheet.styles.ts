import { StyleSheet } from "react-native";
import { borders } from "../theme/tokens";
import { colors } from "../theme/tokens";
import { controls } from "../theme/tokens";
import { radii } from "../theme/tokens";
import { spacing } from "../theme/tokens";
import { tapMin } from "../theme/tokens";
import { typography } from "../theme/tokens";

export const styles = StyleSheet.create({
  sheet: {
    height: "89%",
    maxHeight: "89%",
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    backgroundColor: colors.bg,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.section,
    color: colors.text,
    textAlign: "center",
    marginTop: -spacing.sm,
    paddingBottom: spacing.xs,
  },
  tabsInset: {
    marginHorizontal: spacing.lg,
    marginTop: -spacing.xxl,
  },
  familyThreadTitle: {
    ...typography.label,
    color: colors.textMuted,
    marginHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  thread: { gap: spacing.sm },
  commentItem: { gap: spacing.xs },
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
  commentTextBlock: { flex: 1, gap: spacing.xs },
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
  commentAuthor: { ...typography.label, color: colors.text, flexShrink: 1 },
  commentDate: { ...typography.micro, color: colors.textMuted },
  commentContent: { ...typography.body, color: colors.text },
  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  commentAction: {
    minHeight: tapMin,
    justifyContent: "center",
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.none,
  },
  replyLabel: { ...typography.micro, color: colors.textMuted },
  deleteLabel: { ...typography.micro, color: colors.danger },
  replyComposer: {
    marginLeft: spacing.xl,
    paddingLeft: spacing.md,
    gap: spacing.xs,
    borderLeftWidth: borders.hairline,
    borderLeftColor: colors.accent,
  },
  replyTargetLabel: { ...typography.micro, color: colors.accentTintedText },
  replyComposerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  replyInput: { flex: 1, minHeight: controls.inputHeight },
  replySubmitButton: { minWidth: tapMin },
  replyCancel: {
    alignSelf: "flex-start",
    minHeight: tapMin,
    justifyContent: "center",
  },
  replyCancelLabel: { ...typography.micro, color: colors.textMuted },
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
  hiddenText: { ...typography.label, color: colors.textMuted, flex: 1 },
  hiddenAction: { minHeight: tapMin, justifyContent: "center" },
  hiddenActionLabel: { ...typography.micro, color: colors.accent },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.xl,
  },
  errorBlock: { gap: spacing.xs, alignItems: "flex-start" },
  errorText: { ...typography.body, color: colors.danger },
  familyNoticeBlock: {
    width: "100%",
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  familyNoticeText: {
    color: colors.textMuted,
    textAlign: "center",
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  commentInput: { flex: 1, minHeight: controls.inputHeight },
  submitButton: { minWidth: tapMin },
});
