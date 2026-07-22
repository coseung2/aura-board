import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  borders,
  colors,
  iconSizes,
  radii,
  spacing,
  typography,
} from "../theme/tokens";
import type { WalkingMonthlyAttendanceReward } from "../lib/walking-health";
import { AppButton, ControlPressable } from "./ui";

const COOKIE_REWARD_ORDINALS = new Set([7, 14, 21]);

export function WalkingAttendanceCalendar({
  reward,
  busy = false,
  onDayPress,
  onCatchUp,
}: {
  reward: WalkingMonthlyAttendanceReward;
  busy?: boolean;
  onDayPress?: (day: string) => void;
  onCatchUp?: () => void;
}) {
  const [gridWidth, setGridWidth] = useState(0);
  const monthDays = Math.min(28, Math.max(28, reward.monthDays));
  const attendanceCount = Math.min(
    monthDays,
    Math.max(0, reward.attendanceCount),
  );
  const attendanceDays = reward.attendanceDays ?? Array.from(
    { length: attendanceCount },
    (_, index) => `${reward.month}-${String(index + 1).padStart(2, "0")}`,
  );
  const eligibleAttendanceDays = reward.eligibleAttendanceDays ?? [];

  return (
    <View
      style={styles.section}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${reward.month} 출석미션, ${attendanceCount}/${monthDays}일 달성`}
    >
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.eyebrow}>월간 미션</Text>
          <Text style={styles.title}>출석미션</Text>
        </View>
        <Text style={styles.count}>{attendanceCount} / {monthDays}일</Text>
      </View>

      {eligibleAttendanceDays.length > 0 && onCatchUp ? (
        <AppButton
          variant="secondary"
          loading={busy}
          onPress={onCatchUp}
          accessibilityLabel="출석 미완료 날짜 모두 체크"
        >
          미완료 날짜 모두 체크
        </AppButton>
      ) : null}

      <View
        style={styles.grid}
        onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
      >
        {Array.from({ length: 4 }, (_, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {Array.from({ length: 7 }, (_, columnIndex) => {
            const ordinal = rowIndex * 7 + columnIndex + 1;
            const day = `${reward.month}-${String(ordinal).padStart(2, "0")}`;
            const earned = attendanceDays.includes(day);
            const eligible = eligibleAttendanceDays.includes(day);
            const isItemReward = ordinal === reward.itemRewardOrdinal;
            const isCookieReward = COOKIE_REWARD_ORDINALS.has(ordinal);
            const cashAmount = ordinal % 7 === 0 ? 20 : 10;
            const cellSize = Math.floor(Math.max(
              0,
              (gridWidth - spacing.xs * 6) / 7,
            ));

            return (
              <ControlPressable
                key={ordinal}
                disabled={!eligible || busy}
                onPress={() => onDayPress?.(day)}
                accessibilityRole="button"
                style={[
                  styles.cell,
                  cellSize > 0
                    ? { width: cellSize, height: cellSize }
                    : styles.cellPending,
                  earned && styles.cellEarned,
                  isItemReward && styles.cellItem,
                ]}
                accessibilityLabel={`${ordinal}번, ${
                  isItemReward
                    ? "아이템 보상"
                    : isCookieReward
                      ? `${cashAmount}원과 쿠키 1개`
                      : `${cashAmount}원`
                }, ${earned ? "달성" : "미달성"}`}
              >
                <Text style={[styles.ordinal, earned && styles.textEarned]}>
                  {ordinal}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[styles.reward, earned && styles.textEarned]}
                >
                  {isItemReward
                    ? "아이템"
                    : isCookieReward
                      ? `${cashAmount}원\n+쿠키`
                      : `${cashAmount}원`}
                </Text>
                {earned ? (
                  <View style={styles.stampOverlay} pointerEvents="none">
                    <View style={styles.stamp}>
                      <Text style={styles.stampMark}>✓</Text>
                    </View>
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
  titleGroup: { gap: spacing.xs },
  eyebrow: { ...typography.micro, color: colors.accentTintedText },
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
    minWidth: 0,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  cellPending: { width: "13%", aspectRatio: 1 },
  cellEarned: {
    borderColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  cellItem: { borderColor: colors.accent },
  ordinal: { ...typography.micro, color: colors.textMuted },
  reward: {
    ...typography.micro,
    color: colors.text,
    textAlign: "center",
  },
  textEarned: { color: colors.accentTintedText },
  stampOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  stamp: {
    width: iconSizes.lg,
    height: iconSizes.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.medium,
    borderColor: colors.accent,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceGlassStrong,
  },
  stampMark: { ...typography.label, color: colors.accent },
});
