import { Image, StyleSheet, Text, View } from "react-native";
import {
  borders,
  colors,
  iconSizes,
  radii,
  spacing,
  typography,
  walking,
} from "../theme/tokens";
import type { WalkingMonthlyAttendanceReward } from "../lib/walking-health";
import { ControlPressable } from "./ui";

const COOKIE_REWARD_ORDINALS = new Set([7, 14, 21]);
const MILESTONE_ORDINALS = new Set([7, 14, 21, 28]);
const COOKIE_REWARD_IMAGE = require("../assets/slimes/shared/cookie-shop-icon-256.png");
const ATTENDANCE_STAMP_IMAGE = require("../assets/walking/attendance-stamp.png");

export function WalkingAttendanceCalendar({
  reward,
  busy = false,
  onDayPress,
}: {
  reward: WalkingMonthlyAttendanceReward;
  busy?: boolean;
  onDayPress?: (day: string) => void;
}) {
  const monthDays = Math.min(28, Math.max(28, reward.monthDays));
  const attendanceCount = Math.min(
    monthDays,
    Math.max(0, reward.attendanceCount),
  );
  const visitCount = Math.min(
    monthDays,
    Math.max(attendanceCount, reward.visitCount ?? attendanceCount),
  );
  const eligibleAttendanceDays = reward.eligibleAttendanceDays ?? [];
  const claimedOrdinals = new Set(
    reward.claimedOrdinals ??
      Array.from({ length: attendanceCount }, (_, index) => index + 1),
  );
  const claimableByOrdinal = new Map(
    reward.claimableAttendance?.map((entry) => [entry.ordinal, entry.day]) ??
      eligibleAttendanceDays.map((day, index) => [attendanceCount + index + 1, day]),
  );

  return (
    <View
      style={styles.section}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${reward.month} 출석미션, ${visitCount}/${monthDays}회 접속`}
    >
      <View style={styles.header}>
        <Text style={styles.title}>출석미션</Text>
        <Text style={styles.count}>{visitCount} / {monthDays}회</Text>
      </View>

      <View style={styles.grid}>
        {Array.from({ length: 4 }, (_, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {Array.from({ length: 7 }, (_, columnIndex) => {
              const ordinal = rowIndex * 7 + columnIndex + 1;
              const earned = claimedOrdinals.has(ordinal);
              const eligibleDay = claimableByOrdinal.get(ordinal);
              const eligible = Boolean(eligibleDay);
              const isItemReward = ordinal === reward.itemRewardOrdinal;
              const isCookieReward = COOKIE_REWARD_ORDINALS.has(ordinal);
              const isMilestone = MILESTONE_ORDINALS.has(ordinal);
              const cashAmount = ordinal % 7 === 0 ? 20 : 10;

              return (
                <ControlPressable
                  key={ordinal}
                  disabled={!eligible || busy}
                  onPress={() => eligibleDay && onDayPress?.(eligibleDay)}
                  accessibilityRole="button"
                  style={[
                    styles.cell,
                    earned && styles.cellEarned,
                    isMilestone && styles.cellMilestone,
                  ]}
                  accessibilityLabel={`${ordinal}번, ${
                    isItemReward
                      ? "아이템 보상"
                      : isCookieReward
                        ? `${cashAmount}원과 쿠키 1개`
                        : `${cashAmount}원`
                  }, ${earned ? "수령 완료" : eligible ? "수령 가능" : "미달성"}`}
                >
                  {eligible && !earned ? (
                    <View pointerEvents="none" style={styles.claimableMarker} />
                  ) : null}
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={[
                      styles.ordinal,
                      isMilestone && styles.milestoneOrdinal,
                      earned && styles.textEarned,
                    ]}
                  >
                    {ordinal}일차
                  </Text>
                  <View style={styles.rewardVisual} accessible={false}>
                    {isCookieReward ? (
                      <Image
                        source={COOKIE_REWARD_IMAGE}
                        style={styles.rewardImage}
                        resizeMode="contain"
                        accessible={false}
                      />
                    ) : (
                      <Text style={styles.rewardIcon}>
                        {isItemReward ? "🎁" : "🪙"}
                      </Text>
                    )}
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      style={[
                        styles.quantity,
                        earned && styles.textEarned,
                      ]}
                    >
                      {isItemReward || isCookieReward ? "x1" : `x${cashAmount}`}
                    </Text>
                  </View>
                  {earned ? (
                    <View style={styles.stampOverlay} pointerEvents="none">
                      <Image
                        source={ATTENDANCE_STAMP_IMAGE}
                        style={styles.stampImage}
                        resizeMode="contain"
                        accessible={false}
                      />
                    </View>
                  ) : null}
                </ControlPressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: "100%",
    alignSelf: "stretch",
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  title: { ...typography.section, color: colors.text },
  count: { ...typography.label, color: colors.accentTintedText },
  grid: {
    width: "100%",
    alignSelf: "stretch",
    alignItems: "flex-start",
    alignContent: "flex-start",
    gap: spacing.xs,
  },
  row: {
    width: "100%",
    flexDirection: "row",
    gap: spacing.xs,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    minHeight: walking.missionCellMinHeight,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingVertical: spacing.xs,
    borderWidth: borders.none,
    borderBottomWidth: borders.hairline,
    borderRadius: radii.none,
    borderColor: colors.border,
    backgroundColor: "transparent",
    overflow: "visible",
  },
  cellEarned: {
    borderColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  cellMilestone: {
    backgroundColor: walking.milestoneBackground,
    borderBottomColor: walking.milestoneBorder,
  },
  claimableMarker: {
    width: "34%",
    height: borders.medium,
    marginTop: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
  ordinal: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
    includeFontPadding: false,
  },
  milestoneOrdinal: {
    color: walking.milestoneText,
  },
  rewardVisual: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  rewardIcon: {
    ...typography.label,
    lineHeight: iconSizes.md,
    textAlign: "center",
  },
  rewardImage: {
    width: iconSizes.md,
    height: iconSizes.md,
  },
  quantity: {
    ...typography.micro,
    color: colors.text,
    textAlign: "center",
    includeFontPadding: false,
  },
  textEarned: { color: colors.accentTintedText },
  stampOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  stampImage: {
    width: iconSizes.lg,
    height: iconSizes.lg,
  },
});
