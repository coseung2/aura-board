import type { WalkingDailyStepRewards } from "../../lib/walking-health";
import type { WalkingMonthlyAttendanceReward } from "../../lib/walking-health";
import type { WalkingRepresentativeSlime } from "../../lib/walking-health";
import type { WalkingWeeklyStepRewards } from "../../lib/walking-health";
import { Image } from "react-native";
import { MediaPressable } from "../../components/ui";
import { MissionProgressTrack } from "../../components/MissionProgressTrack";
import { Text } from "react-native";
import { View } from "react-native";
import { WalkingAttendanceCalendar } from "../../components/walking-attendance-calendar";
import { apiFetch } from "../../lib/api";
import { layout } from "../../theme/tokens";
import { spacing } from "../../theme/tokens";
import { studentRewardNumberFormatter as numberFormatter } from "./student-reward-format";
import { styles } from "../../components/student-screens/student-walking.styles";
import { tapMin } from "../../theme/tokens";
import { useState } from "react";
import { walking } from "../../theme/tokens";

const REWARD_CLAIM_BUTTON_IMAGE = require("../../assets/walking/reward-claim-button.png");

const DISABLED_REWARD_CLAIM_BUTTON_IMAGE = require("../../assets/walking/reward-claim-button-disabled.png");

const REWARD_COIN_IMAGE = require("../../assets/walking/reward-coin.png");

export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={styles.summaryRow}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label} ${value}`}
    >
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function RewardClaimButton({
  disabled,
  muted = false,
  label,
  onPress,
  width,
}: {
  disabled: boolean;
  muted?: boolean;
  label: string;
  onPress: () => void;
  width?: number;
}) {
  const buttonWidth = width ?? walking.rewardClaimButtonWidth;
  return (
    <MediaPressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.rewardClaimButton, { width: buttonWidth }]}
    >
      <Image
        source={
          muted ? DISABLED_REWARD_CLAIM_BUTTON_IMAGE : REWARD_CLAIM_BUTTON_IMAGE
        }
        resizeMode="contain"
        style={[
          styles.rewardClaimButtonImage,
          { height: Math.max(tapMin * 0.72, buttonWidth * 0.5) },
        ]}
        accessible={false}
      />
    </MediaPressable>
  );
}

function RankRewardAmount({
  amount,
  claimed = false,
}: {
  amount: number;
  claimed?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        claimed
          ? `${numberFormatter.format(amount)}원 보상 수령 완료`
          : `${numberFormatter.format(amount)}원 보상`
      }
      style={[
        styles.rankRewardAmount,
        claimed && styles.rankRewardAmountClaimed,
      ]}
    >
      <Image
        source={REWARD_COIN_IMAGE}
        resizeMode="contain"
        style={styles.rankRewardCoin}
        accessible={false}
      />
      <Text
        style={[
          styles.rankRewardAmountText,
          claimed && styles.rankRewardAmountTextClaimed,
        ]}
      >
        ×{numberFormatter.format(amount)}
      </Text>
    </View>
  );
}

function claimButtonWidthFor(markerCount: number, trackWidth: number) {
  const count = Math.max(1, markerCount);
  const gap = spacing.xs;
  const available = Math.max(0, trackWidth - gap * Math.max(0, count - 1));
  const maxWidth = walking.rewardClaimButtonWidth;
  const minWidth = walking.rewardClaimButtonMinWidth;
  return Math.max(minWidth, Math.min(maxWidth, Math.floor(available / count)));
}

type MissionRewardMarker = {
  key: string;
  steps: number;
  amount: number;
  claimed: boolean;
  claimable: boolean;
  pending: boolean;
  onClaim: () => void;
};

function MissionRewardTrack({
  totalSteps,
  maxSteps,
  label,
  markers,
  representativeSlime,
}: {
  totalSteps: number;
  maxSteps: number;
  label: string;
  markers: MissionRewardMarker[];
  representativeSlime: WalkingRepresentativeSlime | null;
}) {
  const safeMaxSteps = Math.max(1, maxSteps);
  const [trackWidth, setTrackWidth] = useState(0);
  const claimButtonWidth = claimButtonWidthFor(markers.length, trackWidth);

  return (
    <View
      style={styles.missionRewardTrack}
      onLayout={(event) => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        setTrackWidth((current) =>
          current === nextWidth ? current : nextWidth,
        );
      }}
    >
      <MissionProgressTrack
        value={totalSteps}
        max={safeMaxSteps}
        markerValues={markers.map((marker) => marker.steps)}
        completedMarkerValues={markers
          .filter((marker) => marker.claimed)
          .map((marker) => marker.steps)}
        accessibilityLabel={label}
        representativeSlime={representativeSlime}
      />
      <View style={styles.dailyMilestones}>
        {markers.map((marker) => (
          <View key={marker.key} style={styles.dailyMilestone}>
            <Text style={styles.dailyMilestoneSteps}>
              {numberFormatter.format(marker.steps)}걸음
            </Text>
            <RankRewardAmount amount={marker.amount} />
            {marker.claimed ? (
              <Text style={styles.rewardClaimedLabel}>수령 완료</Text>
            ) : (
              <RewardClaimButton
                disabled={!marker.claimable || marker.pending}
                muted={!marker.claimable || marker.pending}
                onPress={marker.onClaim}
                width={claimButtonWidth}
                label={`${numberFormatter.format(marker.steps)}걸음 보상 ${numberFormatter.format(marker.amount)}원${marker.claimable ? " 수령" : " 아직 수령할 수 없음"}`}
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function WalkingWeeklyRewardProgress({
  rewards,
  onChange,
  representativeSlime,
}: {
  rewards: WalkingWeeklyStepRewards;
  onChange: (rewards: WalkingWeeklyStepRewards) => void;
  representativeSlime: WalkingRepresentativeSlime | null;
}) {
  const [pendingTierKey, setPendingTierKey] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const graphMaxSteps = Math.max(
    1,
    rewards.maxSteps,
    rewards.totalSteps,
    ...rewards.tiers.map((tier) => tier.steps),
  );
  const progress = Math.min(rewards.totalSteps / graphMaxSteps, 1);

  async function claimTier(tierKey: string) {
    const tier = rewards.tiers.find((candidate) => candidate.key === tierKey);
    if (!tier?.achieved || tier.claimed || pendingTierKey) return;
    setPendingTierKey(tierKey);
    setClaimError(null);
    try {
      const payload = await apiFetch<{
        tier: WalkingWeeklyStepRewards["tiers"][number];
      }>("/api/student/walking/rewards/claim", {
        method: "POST",
        json: { kind: "weekly", tierKey },
      });
      onChange({
        ...rewards,
        tiers: rewards.tiers.map((candidate) =>
          candidate.key === tierKey ? payload.tier : candidate,
        ),
      });
    } catch {
      setClaimError("보상을 받지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPendingTierKey(null);
    }
  }

  return (
    <View style={styles.missionBlock}>
      <Text style={styles.missionTitle}>주간미션</Text>
      <View style={styles.missionProgressLabels}>
        <Text style={styles.missionProgressText}>
          {numberFormatter.format(rewards.totalSteps)} /{" "}
          {numberFormatter.format(graphMaxSteps)}걸음
        </Text>
        <Text style={styles.missionProgressPercent}>
          {Math.round(progress * 100)}%
        </Text>
      </View>
      <MissionRewardTrack
        totalSteps={rewards.totalSteps}
        maxSteps={graphMaxSteps}
        label={`이번 주 ${numberFormatter.format(rewards.totalSteps)}걸음, 목표 ${numberFormatter.format(graphMaxSteps)}걸음`}
        markers={rewards.tiers.map((tier) => ({
          key: tier.key,
          steps: tier.steps,
          amount: tier.amount,
          claimed: tier.claimed,
          claimable: tier.achieved && !tier.claimed && pendingTierKey === null,
          pending: pendingTierKey !== null,
          onClaim: () => void claimTier(tier.key),
        }))}
        representativeSlime={representativeSlime}
      />
      {claimError ? <Text style={styles.error}>{claimError}</Text> : null}
    </View>
  );
}

export function WalkingMissionPanel({
  todaySteps,
  dailyGoal,
  dailyRewardAmount,
  dailyUnitCap,
  dailyStepRewards,
  monthlyAttendanceReward,
  attendanceBusy,
  onClaimAttendance,
  weeklyStepRewards,
  representativeSlime,
  onDailyStepRewardsChange,
  onWeeklyStepRewardsChange,
}: {
  todaySteps: number;
  dailyGoal: number;
  dailyRewardAmount: number;
  dailyUnitCap: number;
  dailyStepRewards: WalkingDailyStepRewards | null;
  monthlyAttendanceReward: WalkingMonthlyAttendanceReward | null;
  attendanceBusy: boolean;
  onClaimAttendance: (day: string) => void;
  weeklyStepRewards: WalkingWeeklyStepRewards | null;
  representativeSlime: WalkingRepresentativeSlime | null;
  onDailyStepRewardsChange: (rewards: WalkingDailyStepRewards | null) => void;
  onWeeklyStepRewardsChange: (rewards: WalkingWeeklyStepRewards | null) => void;
}) {
  const safeDailyGoal = Math.max(1, dailyGoal);
  const safeDailyUnitCap = Math.min(4, Math.max(1, dailyUnitCap));
  const dailyMaxSteps = safeDailyGoal * safeDailyUnitCap;
  // Keep the daily marker on the exact same server-calculated progress source
  // that drives daily reward eligibility, just as the weekly marker does.
  const dailyTotalSteps = dailyStepRewards?.totalSteps ?? todaySteps;
  const dailyProgress = Math.min(dailyTotalSteps / dailyMaxSteps, 1);
  const dailyMilestones = Array.from(
    { length: safeDailyUnitCap },
    (_, index) => ({
      steps: safeDailyGoal * (index + 1),
      amount: dailyRewardAmount,
    }),
  );
  const [pendingDailyUnit, setPendingDailyUnit] = useState<number | null>(null);
  const [dailyClaimError, setDailyClaimError] = useState<string | null>(null);

  async function claimDailyUnit(unit: number) {
    const tier = dailyStepRewards?.tiers.find(
      (candidate) => candidate.unit === unit,
    );
    if (!tier?.claimable || pendingDailyUnit !== null) return;
    const currentDailyRewards = dailyStepRewards;
    if (!currentDailyRewards) return;
    setPendingDailyUnit(unit);
    setDailyClaimError(null);
    try {
      const payload = await apiFetch<{
        dailyTier: WalkingDailyStepRewards["tiers"][number];
      }>("/api/student/walking/rewards/claim", {
        method: "POST",
        json: { kind: "daily", unit },
      });
      onDailyStepRewardsChange({
        ...currentDailyRewards,
        tiers: currentDailyRewards.tiers.map((candidate) =>
          candidate.unit === unit ? payload.dailyTier : candidate,
        ),
      });
    } catch {
      setDailyClaimError("보상을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setPendingDailyUnit(null);
    }
  }

  return (
    <View style={styles.missionSection} accessibilityRole="summary">
      {monthlyAttendanceReward ? (
        <WalkingAttendanceCalendar
          reward={monthlyAttendanceReward}
          busy={attendanceBusy}
          onDayPress={onClaimAttendance}
        />
      ) : null}

      <View style={styles.missionBlock}>
        <Text style={styles.missionTitle}>일간미션</Text>
        <View style={styles.missionProgressLabels}>
          <Text style={styles.missionProgressText}>
            {numberFormatter.format(dailyTotalSteps)} /{" "}
            {numberFormatter.format(dailyMaxSteps)}걸음
          </Text>
          <Text style={styles.missionProgressPercent}>
            {Math.round(dailyProgress * 100)}%
          </Text>
        </View>
        <MissionRewardTrack
          totalSteps={dailyTotalSteps}
          maxSteps={dailyMaxSteps}
          label="오늘 걸음 미션 진행률"
          markers={dailyMilestones.map((milestone) => {
            const unit = Math.round(milestone.steps / safeDailyGoal);
            const tier = dailyStepRewards?.tiers.find(
              (candidate) => candidate.unit === unit,
            );
            return {
              key: `daily-${unit}`,
              steps: milestone.steps,
              amount: milestone.amount,
              claimed: tier?.claimed ?? false,
              claimable: tier?.claimable === true && pendingDailyUnit === null,
              pending: pendingDailyUnit !== null,
              onClaim: () => void claimDailyUnit(unit),
            };
          })}
          representativeSlime={representativeSlime}
        />
        {dailyClaimError ? (
          <Text style={styles.error}>{dailyClaimError}</Text>
        ) : null}
      </View>

      {weeklyStepRewards ? (
        <WalkingWeeklyRewardProgress
          rewards={weeklyStepRewards}
          representativeSlime={representativeSlime}
          onChange={(rewards) => onWeeklyStepRewardsChange(rewards)}
        />
      ) : null}
    </View>
  );
}
