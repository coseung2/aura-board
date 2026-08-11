import { StyleSheet } from "react-native";
import { borders } from "../../theme/tokens";
import { colors } from "../../theme/tokens";
import { layout } from "../../theme/tokens";
import { pageChrome } from "../../theme/tokens";
import { radii } from "../../theme/tokens";
import { spacing } from "../../theme/tokens";
import { tapMin } from "../../theme/tokens";
import { typography } from "../../theme/tokens";
import { walking } from "../../theme/tokens";

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: pageChrome.contentStartGap,
    paddingBottom: spacing.xxxl + spacing.xxl,
    gap: spacing.xxl,
    position: "relative",
  },
  tabContent: {
    width: "100%",
    minWidth: 0,
    gap: spacing.xxl,
  },
  // Keep activity tabs sticky above the ScrollView.
  pageTabsRow: {
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
  },
  // Only status/error/notice stay above the main content sections.
  scrollLead: {
    gap: spacing.sm,
  },
  headerActionsWrap: {
    gap: spacing.xs,
    maxWidth: "70%",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
  },
  headerConnection: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: tapMin,
    paddingHorizontal: spacing.xs,
  },
  headerConnectionText: {
    ...typography.micro,
    color: colors.textMuted,
  },
  headerIconButton: {
    minWidth: tapMin,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  viewNav: {
    alignSelf: "stretch",
  },
  viewNavItem: {
    flex: 1,
  },
  connectionDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.textMuted,
  },
  connectionDotConnected: { backgroundColor: colors.statusOnline },
  muted: { ...typography.label, color: colors.textMuted },
  settingsSheet: { padding: spacing.xl, gap: spacing.md },
  settingsTitle: { ...typography.title, color: colors.text },
  settingsActions: { gap: spacing.sm },
  settingsHelp: { ...typography.label, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
  notice: { ...typography.body, color: colors.accentTintedText },
  stateSection: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  stateTitle: {
    ...typography.section,
    color: colors.text,
    textAlign: "center",
  },
  errorSection: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  emptySection: {
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  summarySection: { gap: spacing.sm },
  summaryRows: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  summaryRow: {
    flex: 1,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  summaryLabel: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: "center",
  },
  summaryValue: {
    ...typography.section,
    color: colors.text,
    textAlign: "center",
  },
  rankRewardAmount: {
    width: walking.classroomRankRewardWidth,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xxs,
    opacity: walking.classroomRankRewardMutedOpacity,
  },
  rankRewardAmountClaimed: {
    opacity: walking.classroomRankRewardClaimedOpacity,
  },
  rankRewardCoin: {
    width: walking.rankRewardCoinSize,
    height: walking.rankRewardCoinSize,
  },
  rankRewardAmountText: {
    ...typography.micro,
    color: colors.text,
  },
  rankRewardAmountTextClaimed: { color: colors.textMuted },
  chartSection: {
    gap: spacing.lg,
  },
  missionSection: {
    gap: spacing.xxl,
  },
  missionBlock: {
    gap: spacing.sm,
  },
  missionTitle: {
    ...typography.section,
    color: colors.text,
  },
  missionProgressLabels: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  missionProgressText: {
    ...typography.label,
    color: colors.textMuted,
  },
  missionProgressPercent: { ...typography.label, color: colors.text },
  missionRewardTrack: {
    gap: spacing.xxs,
  },
  missionMarkerLabels: {
    height: spacing.xxl,
    position: "relative",
  },
  missionMarkerLabel: {
    position: "absolute",
    bottom: spacing.none,
    width: walking.chartStepLabelWidth,
    gap: spacing.none,
  },
  missionMarkerLabelStart: { alignItems: "flex-start" },
  missionMarkerLabelCenter: {
    marginLeft: -(walking.chartStepLabelWidth / 2),
    alignItems: "center",
  },
  missionMarkerLabelEnd: {
    marginLeft: -walking.chartStepLabelWidth,
    alignItems: "flex-end",
  },
  missionMarkerSteps: {
    ...typography.micro,
    color: colors.textMuted,
  },
  missionMarkerAmount: {
    ...typography.micro,
    color: colors.text,
  },
  dailyMilestones: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  dailyMilestone: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: spacing.xxs,
  },
  dailyMilestoneSteps: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
  },
  dailyMilestoneAmount: {
    ...typography.label,
    color: colors.text,
    textAlign: "center",
  },
  rewardClaimButton: {
    minWidth: walking.rewardClaimButtonMinWidth,
    maxWidth: walking.rewardClaimButtonWidth,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
  },
  rewardClaimButtonImage: {
    width: "100%",
    height: tapMin,
  },
  rewardClaimedLabel: {
    ...typography.micro,
    color: colors.accentTintedText,
    textAlign: "center",
  },
  chartRows: { gap: spacing.md },
  chartRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dayLabel: {
    ...typography.micro,
    color: colors.textMuted,
    width: walking.chartDayLabelWidth,
  },
  futureDayLabel: { color: colors.textFaint },
  barTrack: {
    flex: 1,
    height: walking.chartBarHeight,
    backgroundColor: colors.accentTintedBg,
    overflow: "hidden",
  },
  barFill: { height: "100%", backgroundColor: colors.accent },
  stepLabel: {
    ...typography.micro,
    color: colors.text,
    width: walking.chartStepLabelWidth,
    textAlign: "right",
  },
});
