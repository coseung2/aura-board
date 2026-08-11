import { StyleSheet } from "react-native";
import { borders } from "../../theme/tokens";
import { colors } from "../../theme/tokens";
import { iconSizes } from "../../theme/tokens";
import { layers } from "../../theme/tokens";
import { layout } from "../../theme/tokens";
import { pageChrome } from "../../theme/tokens";
import { radii } from "../../theme/tokens";
import { shadows } from "../../theme/tokens";
import { slimeUi } from "../../theme/tokens";
import { spacing } from "../../theme/tokens";
import { states } from "../../theme/tokens";
import { tapMin } from "../../theme/tokens";
import { typography } from "../../theme/tokens";

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  effectDismissLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: layers.overlayControl,
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  loadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: { ...typography.body, color: colors.textMuted },
  errorCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.md,
  },
  errorEmoji: { fontSize: iconSizes.gate },
  errorTitle: { ...typography.title, color: colors.text, textAlign: "center" },
  errorMessage: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  scrollContent: {
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: pageChrome.contentStartGap,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  scrollContentWide: {
    alignSelf: "center",
    width: "100%",
    maxWidth: layout.readableMaxWidth,
  },
  // Section tabs live outside the ScrollView so they stay reachable while
  // browsing long pet, classroom, or shop lists.
  pageTabsRow: {
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    alignSelf: "center",
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingBottom: spacing.xs,
  },
  petSectionNav: { width: "100%" },
  petSectionNavItem: { flex: 1 },
  myPetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  myPetCard: {
    position: "relative",
    width: "32%",
    minWidth: 0,
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  // While this card owns an open popover it must sit above the cards rendered
  // after it, or their text would paint over the panel.
  myPetCardEffectOpen: { zIndex: layers.floatingPopover },
  myPetCardDisabled: { opacity: states.disabledOpacity },
  myPetSprite: {
    position: "relative",
    height: iconSizes.empty + spacing.md,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  // Occupies the empty third cell of the second row, so it matches a pet card's
  // width and sits inside the same grid rather than below it.
  // Aligned to the top of the row so its heading reads as a title level with the
  // pet names, with entries filling downward beneath it.
  myPetSetCard: {
    width: "32%",
    minWidth: 0,
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xxs,
    gap: spacing.xxs,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  myPetSetTitle: {
    ...typography.label,
    color: colors.text,
    textAlign: "center",
  },
  myPetSetRow: { gap: spacing.none },
  myPetSetName: {
    ...typography.micro,
    color: colors.text,
    textAlign: "center",
  },
  myPetSetValue: {
    ...typography.micro,
    color: colors.accent,
    textAlign: "center",
  },
  myPetSpriteEffectOpen: { zIndex: layers.floatingPopover },
  // The sprite slot already carries transparent bottom pixels (and a taller
  // vehicle scene carries more). Compensate below the name so the visible
  // sprite -> name and name -> growth gaps read evenly on-device rather than
  // merely sharing the same flex `gap` value.
  myPetNameRow: {
    width: "100%",
    minHeight: iconSizes.md,
    marginBottom: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
  },
  myPetNameActionSlot: {
    position: "relative",
    width: iconSizes.lg,
    height: iconSizes.md,
  },
  myPetEffectButton: {
    position: "absolute",
    left: (iconSizes.lg - tapMin) / 2,
    top: (iconSizes.md - tapMin) / 2,
    zIndex: layers.cardOverlay,
    width: tapMin,
    height: tapMin,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  myPetEffectArrow: { width: slimeUi.effectArrow, height: slimeUi.effectArrow },
  myPetStarButton: {
    position: "absolute",
    left: (iconSizes.lg - tapMin) / 2,
    top: (iconSizes.md - tapMin) / 2,
    zIndex: layers.cardOverlay,
    width: tapMin,
    height: tapMin,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  myPetEffectPopover: {
    position: "absolute",
    left: 0,
    top: iconSizes.lg + spacing.xxs,
    zIndex: layers.floatingPopover,
    width: slimeUi.effectPopoverWidth,
    padding: spacing.sm,
    gap: spacing.xxs,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.btn,
    backgroundColor: colors.surface,
    ...shadows.lift,
  },
  myPetEffectPopoverTitle: {
    ...typography.micro,
    color: colors.text,
    fontWeight: "700",
  },
  myPetEffectPopoverRow: { gap: spacing.none },
  myPetEffectPopoverText: { ...typography.micro, color: colors.textMuted },
  myPetEffectPopoverValue: {
    ...typography.micro,
    color: colors.accentTintedText,
    fontWeight: "700",
  },
  myPetName: {
    ...typography.micro,
    flex: 1,
    minWidth: 0,
    color: colors.textMuted,
    textAlign: "center",
  },
  myPetNameSelected: { color: colors.accentTintedText },
  // Above the sprite so the bar and its label stay legible, but below any open
  // popover. It previously borrowed the notice layer, which put it over popovers
  // and clipped the buff and growth panels behind the bar.
  myPetGrowth: {
    position: "relative",
    zIndex: layers.raisedContent,
    width: "100%",
    minHeight: spacing.none,
    gap: spacing.xs,
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  myPetGrowthMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xxs,
  },
  myPetGrowthLabel: { ...typography.micro, color: colors.textMuted },
  myPetGrowthPercent: {
    ...typography.micro,
    color: colors.accentTintedText,
    fontVariant: ["tabular-nums"],
  },
  myPetGrowthTrack: {
    height: spacing.xs,
    overflow: "hidden",
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  myPetGrowthFill: {
    height: "100%",
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
  myPetGrowthPopover: {
    position: "absolute",
    left: 0,
    bottom: iconSizes.lg + spacing.xs,
    zIndex: layers.floatingPopover,
    width: slimeUi.growthPopoverWidth,
    padding: spacing.sm,
    gap: spacing.xxs,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.btn,
    backgroundColor: colors.surface,
    ...shadows.lift,
  },
  myPetActions: {
    width: "100%",
    marginTop: -spacing.xxs,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xxs,
  },
  appliedEffects: { width: "100%", gap: spacing.sm, paddingTop: spacing.sm },
  appliedEffectsTitle: { ...typography.label, color: colors.text },
  appliedEffectsList: { gap: spacing.xxs },
  appliedEffectRow: {
    minHeight: tapMin - spacing.md,
    paddingHorizontal: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    backgroundColor: colors.transparent,
  },
  appliedEffectLabel: {
    ...typography.micro,
    width: iconSizes.empty - spacing.sm,
    flexShrink: 0,
    color: colors.text,
    fontWeight: "700",
  },
  appliedEffectDescription: {
    ...typography.micro,
    flex: 1,
    minWidth: 0,
    color: colors.textMuted,
    textAlign: "left",
  },
  appliedEffectValue: {
    ...typography.micro,
    width: iconSizes.lg + spacing.xs,
    flexShrink: 0,
    color: colors.accentTintedText,
    fontWeight: "700",
    textAlign: "right",
  },
  appliedEffectsEmpty: { ...typography.micro, color: colors.textMuted },
  myPetActionLink: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  myPetActionText: {
    ...typography.micro,
    color: colors.accentTintedText,
    textAlign: "center",
    fontWeight: "700",
  },
  myPetCookieButton: {
    width: iconSizes.md + spacing.xl,
    minHeight: tapMin - spacing.md,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  myPetCookieIcon: { width: iconSizes.md, height: iconSizes.md },
  myPetCookieQuantity: {
    ...typography.micro,
    color: colors.accentTintedText,
    fontVariant: ["tabular-nums"],
  },
  myPetCookieQuantityDisabled: { color: colors.textFaint },
  unownedSprite: {
    width: iconSizes.empty,
    height: iconSizes.empty,
    alignItems: "center",
    justifyContent: "center",
  },
  unownedGlyph: { ...typography.section, color: colors.textFaint },
  floorList: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: spacing.sm,
  },
  shopPage: { gap: spacing.sm },
  shopBalance: {
    ...typography.label,
    color: colors.accentTintedText,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  shopNav: { width: "100%" },
  shopNavItem: { flex: 1, paddingHorizontal: spacing.xxs },
  shopContent: { paddingBottom: spacing.sm, gap: spacing.sm },
  shopOverview: { gap: spacing.lg },
  shopOverviewSection: { width: "100%", gap: spacing.sm },
  shopOverviewHeading: { ...typography.section, color: colors.text },
  floorRow: {
    width: "31.5%",
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: spacing.xxs,
  },
  vehicleSceneSlot: {
    position: "relative",
    height: slimeUi.vehicleSceneSlotHeight,
    overflow: "hidden",
  },
  // Price bands stack down the page, so each band spans the full width and lays
  // its own items out in the same wrapping grid the ungrouped list used. Without
  // `width: "100%"` a band would be treated as one cell of the parent row and the
  // three bands would sit side by side.
  shopTierGroup: { width: "100%", gap: spacing.xs },
  // The outer list stacks bands vertically; the grid lives inside each band.
  shopTierList: { gap: spacing.sm },
  // No rule between bands; the gap and label carry the separation.
  shopTierLabel: { ...typography.micro, color: colors.textMuted },
  // Outfit slots are separated by a rule, one level above the price bands inside
  // them, so the two groupings stay visually distinguishable.
  shopOutfitDivider: {
    height: borders.hairline,
    marginTop: spacing.xs,
    marginBottom: spacing.xxs,
    backgroundColor: colors.border,
  },
  shopOutfitLabel: { ...typography.section, color: colors.text },
  shopTierItems: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: spacing.sm,
  },
  emptyCard: { width: "100%", padding: spacing.lg },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  // Opaque fill plus a hairline edge, since the notice now covers content rather
  // than tinting it.
  // Sits just above the bottom nav rather than a full tap target higher, so the
  // result of a tap appears near the thumb that made it. The nav already reserves
  // the safe area below itself, so a small gap is all that is needed here.
  notice: {
    position: "absolute",
    zIndex: layers.notice,
    bottom: spacing.sm,
    left: pageChrome.horizontalPadding,
    right: pageChrome.horizontalPadding,
    minHeight: tapMin,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    ...shadows.lift,
  },
  // Opaque rather than tinted: the notice floats over the pet grid and shop list,
  // so a translucent fill let the content behind it show through.
  noticeSuccess: { backgroundColor: colors.noticeSuccessBg },
  noticeError: { backgroundColor: colors.noticeErrorBg },
  noticeIcon: { flexShrink: 0 },
  noticeText: { ...typography.label, flex: 1 },
  noticeSuccessText: { color: colors.plantActive },
  noticeErrorText: { color: colors.danger },
  classroomCard: {
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
  },
  classroomEmoji: { fontSize: iconSizes.gate },
  classroomTitle: { ...typography.title, color: colors.text },
  classroomText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  classroomState: {
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
  },
  classroomList: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  classmateCard: {
    width: "32%",
    minWidth: 0,
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.xs,
    alignItems: "center",
    gap: spacing.xxs,
    overflow: "hidden",
  },
  classmateBody: {
    width: "100%",
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    gap: spacing.xxs,
  },
  classmateName: {
    ...typography.micro,
    color: colors.text,
    alignSelf: "stretch",
    textAlign: "center",
  },
  classmateSprite: {
    height: iconSizes.empty + spacing.md,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  noRepresentative: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  classmatePlaceholderText: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
  },
  classmateTitleSpacer: { width: "100%", height: spacing.xxl },
});
