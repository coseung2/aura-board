import { StyleSheet } from "react-native";
import { borders } from "../theme/tokens";
import { colors } from "../theme/tokens";
import { composer } from "../theme/tokens";
import { controls } from "../theme/tokens";
import { navigation } from "../theme/tokens";
import { radii } from "../theme/tokens";
import { shadows } from "../theme/tokens";
import { spacing } from "../theme/tokens";
import { states } from "../theme/tokens";
import { tapMin } from "../theme/tokens";
import { typography } from "../theme/tokens";

export const styles = StyleSheet.create({
  surfaceCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: borders.hairline,
    borderRadius: radii.card,
    ...shadows.card,
  },
  surfacePressed: {
    borderColor: colors.borderHover,
    backgroundColor: colors.surfaceAlt,
  },
  controlPressable: {
    minHeight: tapMin,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
  },
  controlPressed: {
    borderColor: colors.borderHover,
    backgroundColor: colors.surfaceAlt,
  },
  textActionPressable: {
    minHeight: tapMin,
    backgroundColor: colors.transparent,
  },
  textActionPressed: {
    backgroundColor: colors.accentTintedBg,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
  },
  modalBackdropRight: {
    justifyContent: "flex-start",
    alignItems: "flex-end",
    padding: spacing.none,
  },
  modalSheetWrap: {
    width: "100%",
    maxWidth: composer.sheetMaxWidth,
    maxHeight: "100%",
  },
  modalSideSheetWrap: {
    height: "100%",
  },
  modalKeyboardWrap: {
    width: "100%",
    maxWidth: composer.sheetMaxWidth,
    height: composer.sheetMaxHeight,
    justifyContent: "center",
  },
  modalSheet: {
    width: "100%",
    maxWidth: composer.sheetMaxWidth,
    maxHeight: "100%",
    overflow: "hidden",
  },
  bottomSheetRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  bottomSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.modalBackdrop,
  },
  bottomSheetKeyboardWrap: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
  },
  bottomSheet: {
    maxHeight: "90%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    overflow: "hidden",
  },
  bottomSheetHandleArea: {
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xs,
  },
  bottomSheetHandle: {
    width: spacing.xxl,
    height: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.borderHover,
  },
  button: {
    minHeight: tapMin,
    borderRadius: radii.btn,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.hairline,
  },
  buttonCompact: {
    minHeight: controls.compactButtonMinHeight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  buttonText: {
    ...typography.label,
  },
  disabled: {
    opacity: states.disabledOpacity,
  },
  textField: {
    minHeight: controls.inputHeight,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    includeFontPadding: false,
  },
  textFieldSingleLine: {
    paddingVertical: spacing.none,
    textAlignVertical: "center",
  },
  textFieldMultiline: {
    minHeight: controls.multilineInputMinHeight,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    textAlignVertical: "top",
    lineHeight: typography.body.lineHeight,
  },
  iconButton: {
    width: controls.iconButton,
    height: controls.iconButton,
    borderRadius: radii.btn,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  pillText: {
    ...typography.badge,
  },
  fab: {
    position: "absolute",
    right: spacing.xl,
    bottom: spacing.xl,
    width: controls.fab,
    height: controls.fab,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.accent,
  },
  fabPressed: {
    backgroundColor: colors.accentActive,
    transform: [{ scale: states.pressedScale }],
  },
  emptyState: {
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  emptyIcon: {
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    ...typography.subtitle,
    color: colors.text,
    textAlign: "center",
  },
  emptyDescription: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  appHeader: {
    height: navigation.headerHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  appHeaderWithBanner: {
    borderBottomWidth: borders.none,
  },
  appHeaderBack: {
    backgroundColor: colors.transparent,
    marginLeft: -spacing.md,
  },
  appHeaderTitleGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  appHeaderTitle: {
    ...typography.title,
    color: colors.text,
    flexShrink: 1,
  },
  appHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginRight: -spacing.md,
  },
  sectionHeader: {
    minHeight: tapMin + spacing.xs,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  sectionHeaderCopy: {
    flex: 1,
    minWidth: 0,
    minHeight: tapMin + spacing.xs,
    paddingBottom: spacing.xs,
    justifyContent: "flex-end",
  },
  sectionHeaderTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    flexWrap: "nowrap",
  },
  sectionHeaderTitle: {
    ...typography.subtitle,
    color: colors.text,
    flexShrink: 1,
  },
  sectionHeaderRight: {
    flexShrink: 0,
    alignSelf: "flex-end",
  },
});

export const iconButtonHitSlop = Math.max(
  (tapMin - controls.iconButton) / 2,
  0,
);

export const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    ...shadows.accent,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  quiet: {
    backgroundColor: colors.transparent,
    borderColor: colors.transparent,
  },
  success: {
    backgroundColor: colors.plantActive,
    borderColor: colors.plantActive,
  },
  danger: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
});

export const pressedStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.accentActive,
    borderColor: colors.accentActive,
  },
  secondary: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderHover,
  },
  quiet: {
    backgroundColor: colors.surfaceAlt,
  },
  success: {
    backgroundColor: colors.plantActivePressed,
    borderColor: colors.plantActivePressed,
  },
  danger: {
    backgroundColor: colors.dangerActive,
    borderColor: colors.dangerActive,
  },
});

export const textVariantStyles = StyleSheet.create({
  primary: {
    color: colors.onAccent,
  },
  secondary: {
    color: colors.text,
  },
  quiet: {
    color: colors.textMuted,
  },
  success: {
    color: colors.onAccent,
  },
  danger: {
    color: colors.onAccent,
  },
});

export const indicatorColors = {
  primary: colors.onAccent,
  secondary: colors.text,
  quiet: colors.textMuted,
  success: colors.onAccent,
  danger: colors.onAccent,
} as const;

export const pillStyles = StyleSheet.create({
  neutral: {
    backgroundColor: colors.surfaceAlt,
  },
  accent: {
    backgroundColor: colors.accentTintedBg,
  },
  danger: {
    backgroundColor: colors.statusReturnedBg,
  },
  warning: {
    backgroundColor: colors.warningTintedBg,
  },
  submitted: {
    backgroundColor: colors.statusSubmittedBg,
  },
  reviewed: {
    backgroundColor: colors.statusReviewedBg,
  },
});

export const pillTextStyles = StyleSheet.create({
  neutral: {
    color: colors.textMuted,
  },
  accent: {
    color: colors.accentTintedText,
  },
  danger: {
    color: colors.statusReturnedText,
  },
  warning: {
    color: colors.warningTintedText,
  },
  submitted: {
    color: colors.statusSubmittedText,
  },
  reviewed: {
    color: colors.statusReviewedText,
  },
});
