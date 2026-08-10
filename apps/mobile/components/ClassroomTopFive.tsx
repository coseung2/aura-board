import { Image, StyleSheet, Text, View } from "react-native";
import {
  borders,
  colors,
  spacing,
  tapMin,
  typography,
  walking,
} from "../theme/tokens";
import { MediaPressable, SectionHeader } from "./ui";

const numberFormatter = new Intl.NumberFormat("ko-KR");
const REWARD_CLAIM_BUTTON_IMAGE = require("../assets/walking/reward-claim-button.png");
const DISABLED_REWARD_CLAIM_BUTTON_IMAGE = require("../assets/walking/reward-claim-button-disabled.png");
const REWARD_COIN_IMAGE = require("../assets/walking/reward-coin.png");

export type ClassroomTopFiveRank = {
  studentId: string;
  studentName: string;
  metricValue: number;
  isCurrent: boolean;
  rewardAmount: number;
};

export type ClassroomRankReward = {
  weekStart: string;
  rank: number;
  amount: number;
};

type Props = {
  ranks: ClassroomTopFiveRank[];
  rankRewards: ClassroomRankReward[];
  nextResetAt: string | null;
  metricUnit: "걸음" | "권";
  rewardPending: boolean;
  onClaimReward: (weekStart: string) => void;
};

export function ClassroomTopFive({
  ranks,
  rankRewards,
  nextResetAt,
  metricUnit,
  rewardPending,
  onClaimReward,
}: Props) {
  return (
    <View style={styles.section} accessibilityRole="summary">
      <SectionHeader
        title="우리 반 Top 5"
        right={
          <Text style={styles.period}>
            {formatRankResetAt(nextResetAt)} 랭킹 초기화
          </Text>
        }
      />
      {rankRewards.map((reward) => (
        <View key={reward.weekStart} style={styles.rewardRow}>
          <Text style={styles.rewardLabel}>
            {formatRankRewardPeriod(reward.weekStart)} {reward.rank}등
          </Text>
          <RankRewardAmount amount={reward.amount} />
          <View style={styles.rewardClaimAction}>
            <RewardClaimButton
              disabled={rewardPending}
              muted={rewardPending}
              onPress={() => onClaimReward(reward.weekStart)}
              label={`${numberFormatter.format(reward.amount)}원 순위 보상 수령`}
            />
          </View>
        </View>
      ))}
      {ranks.length === 0 ? (
        <Text style={styles.emptyState}>
          {metricUnit === "걸음"
            ? "이번 주 걸음 기록이 아직 없어요."
            : "이번 주 독서 기록이 아직 없어요."}
        </Text>
      ) : null}
      <View accessibilityRole="list">
        {ranks.map((rank, index) => (
          <View
            key={rank.studentId}
            style={[styles.row, rank.isCurrent && styles.currentRow]}
            accessibilityRole="summary"
            accessibilityLabel={`${index + 1}위 ${rank.studentName}, ${numberFormatter.format(rank.metricValue)}${metricUnit}, 보상 ${numberFormatter.format(rank.rewardAmount)}원${
              rank.isCurrent ? ", 나" : ""
            }`}
          >
            <Text style={styles.rank}>{index + 1}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {rank.studentName}
            </Text>
            <Text style={styles.metric}>
              {numberFormatter.format(rank.metricValue)}{metricUnit}
            </Text>
            <RankRewardAmount amount={rank.rewardAmount} />
          </View>
        ))}
      </View>
    </View>
  );
}

function RewardClaimButton({
  disabled,
  muted,
  label,
  onPress,
}: {
  disabled: boolean;
  muted: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <MediaPressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={styles.claimButton}
    >
      <Image
        source={muted ? DISABLED_REWARD_CLAIM_BUTTON_IMAGE : REWARD_CLAIM_BUTTON_IMAGE}
        resizeMode="contain"
        style={styles.claimButtonImage}
        accessible={false}
      />
    </MediaPressable>
  );
}

function RankRewardAmount({ amount }: { amount: number }) {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${numberFormatter.format(amount)}원 보상`}
      style={styles.rewardAmount}
    >
      <Image
        source={REWARD_COIN_IMAGE}
        resizeMode="contain"
        style={styles.rewardCoin}
        accessible={false}
      />
      <Text style={styles.rewardAmountText}>×{numberFormatter.format(amount)}</Text>
    </View>
  );
}

function formatRankResetAt(value: string | null) {
  if (!value) return "월 00:00";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "월 00:00";
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    month: "2-digit",
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday =
    { Sun: "일", Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토" }[
      values.weekday ?? ""
    ] ?? "월";
  return `${values.month}/${values.day}(${weekday}) ${values.hour}:00`;
}

function formatRankRewardPeriod(weekStart: string) {
  const [year, month, day] = weekStart.split("-").map(Number);
  if (!year || !month || !day) return "지난 주차";
  // Ranking periods begin on Monday. The first Monday-start period in a month is week 1.
  const weekOfMonth = Math.floor((day - 1) / 7) + 1;
  return `${month}월 ${weekOfMonth}주차`;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  period: { ...typography.label, color: colors.textMuted },
  emptyState: {
    ...typography.body,
    color: colors.textMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  row: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    paddingHorizontal: spacing.sm,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  currentRow: { backgroundColor: colors.accentTintedBg },
  rank: {
    width: spacing.xl,
    ...typography.section,
    color: colors.accentTintedText,
    textAlign: "center",
  },
  name: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    minWidth: 0,
    marginRight: walking.classroomRankRewardWidth,
  },
  metric: {
    ...typography.label,
    color: colors.textMuted,
    position: "absolute",
    left: spacing.none,
    right: spacing.none,
    textAlign: "center",
  },
  rewardRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.accentTintedBg,
  },
  rewardLabel: {
    ...typography.label,
    color: colors.text,
    position: "absolute",
    left: spacing.sm,
  },
  rewardClaimAction: { position: "absolute", right: spacing.xs },
  rewardAmount: {
    width: walking.classroomRankRewardWidth,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xxs,
    opacity: walking.classroomRankRewardMutedOpacity,
  },
  rewardCoin: {
    width: walking.rankRewardCoinSize,
    height: walking.rankRewardCoinSize,
  },
  rewardAmountText: {
    ...typography.micro,
    color: colors.text,
  },
  claimButton: {
    width: walking.rewardClaimButtonWidth,
    minWidth: walking.rewardClaimButtonMinWidth,
    maxWidth: walking.rewardClaimButtonWidth,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
  },
  claimButtonImage: {
    width: "100%",
    height: Math.max(tapMin * 0.72, walking.rewardClaimButtonWidth * 0.5),
  },
});
