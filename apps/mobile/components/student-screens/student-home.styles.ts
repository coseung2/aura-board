import { StyleSheet } from "react-native";
import { borders } from "../../theme/tokens";
import { colors } from "../../theme/tokens";
import { dashboard } from "../../theme/tokens";
import { iconSizes } from "../../theme/tokens";
import { media } from "../../theme/tokens";
import { pageChrome } from "../../theme/tokens";
import { radii } from "../../theme/tokens";
import { shadows } from "../../theme/tokens";
import { slimeUi } from "../../theme/tokens";
import { spacing } from "../../theme/tokens";
import { tapMin } from "../../theme/tokens";
import { typography } from "../../theme/tokens";

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  errorCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  errorEmoji: { fontSize: iconSizes.gate },
  errorTitle: { ...typography.title, color: colors.text },
  errorMsg: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  scrollContent: {
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  dailyGamePanel: {
    alignSelf: "stretch",
    backgroundColor: colors.transparent,
  },
  dailyGameHeader: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  petHeaderTitle: {
    width: "46%",
    minHeight: tapMin,
    minWidth: 0,
    alignItems: "center",
    flexDirection: "row",
  },
  rewardHeaderTitle: {
    flex: 1,
    minWidth: 0,
    paddingLeft: spacing.sm,
  },
  dailyGameTitle: {
    ...typography.section,
    color: colors.text,
  },
  dailyGameBody: {
    minHeight: slimeUi.homePetSceneHeight,
    flexDirection: "row",
    alignItems: "stretch",
  },
  petPane: {
    width: "46%",
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  representativePetScene: {
    position: "relative",
    width: "100%",
    height: slimeUi.homePetSceneHeight,
    maxWidth: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  petEmptyState: {
    height: slimeUi.homePetSceneHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  petEmptyText: { ...typography.body, color: colors.textMuted },
  dailyRewardList: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingVertical: spacing.xxs,
  },
  dailyRewardLoading: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  dailyRewardRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  dailyRewardLabel: {
    ...typography.badge,
    color: colors.text,
    width: spacing.xxl,
  },
  dailyRewardStatus: {
    ...typography.micro,
    color: colors.textMuted,
    flex: 1,
    minWidth: 0,
    textAlign: "right",
  },
  dailyRewardStatusComplete: { color: colors.plantActive },
  dailyRewardStatusClaimable: { color: colors.accentTintedText },
  dailyRewardStatusDisabled: { color: colors.textFaint },
  dailyRewardError: {
    ...typography.micro,
    color: colors.danger,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xxs,
  },
  landscapeOverview: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.lg,
  },
  overviewStack: {
    gap: spacing.none,
  },
  overviewItem: {
    minWidth: 0,
  },
  landscapeOverviewItem: {
    flex: 1,
    minWidth: 0,
  },

  headerStudentName: {
    ...typography.label,
    color: colors.textMuted,
    flexShrink: 1,
    alignSelf: "flex-end",
  },
  showcaseBand: {
    marginHorizontal: -spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.showcaseBand,
    gap: spacing.sm,
  },
  showcaseHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  showcaseTitle: {
    ...typography.section,
    color: colors.text,
  },
  showcaseTitleIcon: { fontSize: iconSizes.md },
  showcaseMore: {
    ...typography.label,
    color: colors.accent,
  },
  showcaseRowContent: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  showcaseChip: {
    width: dashboard.compactCardSize,
    minHeight: dashboard.compactCardSize,
    overflow: "hidden",
    position: "relative",
  },
  showcaseChipSkeleton: {
    width: dashboard.compactCardSize,
    height: dashboard.compactCardSize,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  showcaseChipBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: dashboard.badgeSize,
    height: dashboard.badgeSize,
    borderRadius: radii.pill,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
  },
  showcaseChipBadgeText: { ...typography.badge },
  showcasePreview: {
    aspectRatio: media.previewAspectRatio,
    backgroundColor: colors.bgAlt,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  showcasePreviewImage: {
    width: "100%",
    height: "100%",
  },
  showcasePlay: {
    position: "absolute",
    width: spacing.xxl,
    height: spacing.xxl,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  showcasePlayText: {
    color: colors.text,
    fontSize: iconSizes.md,
    marginLeft: spacing.xs,
  },
  showcaseChipBody: { gap: spacing.xs, padding: spacing.sm },
  showcaseChipTitle: { ...typography.section, color: colors.text },
  showcaseChipContent: {
    ...typography.body,
    color: colors.textMuted,
  },
  showcaseMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  showcaseAuthor: {
    maxWidth: dashboard.authorMaxWidth,
  },
  showcaseAuthorText: {
    ...typography.badge,
    color: colors.accent,
  },
  showcaseDate: { ...typography.micro, color: colors.textMuted },

  portfolioCtaCompact: {
    paddingVertical: spacing.md,
  },
  walletCardCompact: {
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  sectionNav: {
    paddingTop: spacing.xs,
  },
  walletTitleCompact: { ...typography.subtitle, color: colors.text },
  walletDetailLink: {
    minHeight: tapMin,
    minWidth: 0,
    flexDirection: "row",
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.none,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
    alignItems: "flex-end",
    justifyContent: "center",
    flexShrink: 1,
  },
  walletDetailLinkText: {
    ...typography.badge,
    color: colors.textMuted,
  },
  walletBalanceRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  walletBalanceLabelCompact: {
    ...typography.body,
    color: colors.textMuted,
  },
  walletBalanceValueCompact: {
    ...typography.subtitle,
    color: colors.text,
    paddingBottom: spacing.xxs,
  },
  walletFdPillText: {
    ...typography.badge,
    color: colors.accent,
  },
  walletEmptyCompact: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.xs,
  },

  dutyList: {
    overflow: "hidden",
  },
  dutyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: tapMin,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.none,
    borderWidth: borders.none,
    borderRadius: radii.none,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
    backgroundColor: colors.transparent,
  },
  dutyRowLast: {
    borderBottomWidth: borders.none,
  },
  dutyRowEmoji: { fontSize: iconSizes.md },
  dutyRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  dutyRowRole: {
    ...typography.label,
    color: colors.text,
  },
  dutyRowClassroom: {
    ...typography.micro,
    color: colors.textMuted,
  },
  dutyRowCta: {
    ...typography.badge,
    color: colors.accent,
  },

  sectionSub: {
    ...typography.section,
    color: colors.text,
  },
  boardSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    flexWrap: "wrap",
    paddingTop: spacing.md,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  boardGrid: { marginTop: spacing.xxs },
  gridRow: { flexDirection: "row" },
  gridCell: { flex: 1 },
  boardCard: {
    flex: 1,
    minHeight: dashboard.boardMinHeight,
    padding: 0,
    overflow: "hidden",
  },
  boardThumb: {
    aspectRatio: dashboard.boardThumbAspectRatio,
    backgroundColor: colors.bgAlt,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  boardThumbImage: {
    width: "100%",
    height: "100%",
  },
  boardCardBody: {
    padding: spacing.md,
    gap: spacing.xs,
    flex: 1,
  },
  boardCardTitle: { ...typography.section, color: colors.text },
  boardCardMeta: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: "auto",
  },

  emptyWrap: {
    alignItems: "center",
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  emptyEmoji: { fontSize: iconSizes.empty },
  emptyTitle: { ...typography.title, color: colors.text },
  emptyMsg: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  assignmentPanel: {
    paddingVertical: spacing.md,
    gap: spacing.none,
  },
  assignmentTitle: {
    ...typography.subtitle,
    color: colors.text,
  },
  assignmentList: {
    paddingBottom: spacing.xs,
  },
  assignmentRows: {
    overflow: "hidden",
  },
  assignmentExpand: {
    minHeight: tapMin,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingVertical: spacing.xs,
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  assignmentExpandText: {
    ...typography.badge,
    color: colors.accent,
  },
  assignmentEmpty: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.md,
    textAlign: "center",
  },
  assignmentRow: {
    minHeight: tapMin,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.none,
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  assignmentRowStatic: {
    backgroundColor: colors.transparent,
  },
  assignmentRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  assignmentMain: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  assignmentTitleText: {
    ...typography.label,
    color: colors.text,
  },
  assignmentSubtitleText: {
    ...typography.badge,
    color: colors.textMuted,
  },
  assignmentMeta: {
    alignItems: "flex-end",
    gap: spacing.xxs,
  },
  assignmentStatus: {
    ...typography.badge,
  },
  assignmentStatusMissing: {
    color: colors.danger,
  },
  assignmentStatusSubmitted: {
    color: colors.accent,
  },
  assignmentDate: {
    ...typography.micro,
    color: colors.textMuted,
  },
});
