import type {
  ReadingMissionKey,
  ReadingMissionStep,
  ReadingMission,
  ReadingWeeklyMissionReward,
} from "./use-student-reading-screen-model";
import type { WalkingRepresentativeSlime } from "../../lib/walking-health";
import { Image } from "react-native";
import { MediaPressable } from "../../components/ui";
import { MissionProgressTrack } from "../../components/MissionProgressTrack";
import { Text } from "react-native";
import { View } from "react-native";
import { studentRewardNumberFormatter as numberFormatter } from "./student-reward-format";
import { styles } from "../../components/student-screens/student-reading.styles";

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

function ReadingRewardClaimButton({
  disabled,
  muted = false,
  label,
  onPress,
}: {
  disabled: boolean;
  muted?: boolean;
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
      style={styles.rewardClaimButton}
    >
      <Image
        source={
          muted ? DISABLED_REWARD_CLAIM_BUTTON_IMAGE : REWARD_CLAIM_BUTTON_IMAGE
        }
        resizeMode="contain"
        style={styles.rewardClaimButtonImage}
        accessible={false}
      />
    </MediaPressable>
  );
}

function ReadingRewardCoinAmount({ amount }: { amount: number }) {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${numberFormatter.format(amount)}원 보상`}
      style={styles.rewardCoinAmount}
    >
      <Image
        source={REWARD_COIN_IMAGE}
        resizeMode="contain"
        style={styles.rewardCoinImage}
        accessible={false}
      />
      <Text style={styles.rewardCoinText}>
        ×{numberFormatter.format(amount)}
      </Text>
    </View>
  );
}

function readingMissionMarkerValues(mission: ReadingMission) {
  const target = Math.max(0, mission.target);
  if (target === 0) return [];

  const interval = mission.key === "reflection_chars" ? 200 : 1;
  const markers: number[] = [];
  for (let value = interval; value < target; value += interval) {
    markers.push(value);
  }
  markers.push(target);
  return markers;
}

function readingMissionSteps(mission: ReadingMission): ReadingMissionStep[] {
  if (mission.steps && mission.steps.length > 0) return mission.steps;
  return readingMissionMarkerValues(mission).map((target, index) => {
    const achieved = mission.progress >= target;
    return {
      unit: index + 1,
      target,
      amount: 10,
      achieved,
      claimed: mission.claimed,
      claimable: achieved && !mission.claimed,
    };
  });
}

function readingMissionBoundaryLabel(mission: ReadingMission, marker: number) {
  return `${numberFormatter.format(marker)}${mission.unit}`;
}

export function ReadingWeeklyMissionPanel({
  reward,
  representativeSlime,
  claiming,
  claimError,
  onClaim,
}: {
  reward: ReadingWeeklyMissionReward;
  representativeSlime: WalkingRepresentativeSlime | null;
  claiming: boolean;
  claimError: string | null;
  onClaim: (missionKey: ReadingMissionKey, unit: number) => void;
}) {
  return (
    <View style={styles.missionBlock}>
      <View style={styles.missionPreviewList}>
        {reward.missions.map((mission) => {
          const steps = readingMissionSteps(mission);
          const markerValues = steps.map((step) => step.target);
          return (
            <View
              key={mission.key}
              style={styles.missionPreview}
              accessibilityRole="summary"
              accessibilityLabel={`${mission.title}, ${mission.progress}/${mission.target}${mission.unit}, 보상 ${mission.amount}원${mission.claimed ? ", 수령 완료" : mission.completed ? ", 수령 가능" : ""}`}
            >
              <View style={styles.missionPreviewText}>
                <View style={styles.missionTitleRow}>
                  <Text style={styles.missionPreviewTitle}>
                    {mission.title}
                  </Text>
                  <Text
                    style={[
                      styles.missionProgressLabel,
                      mission.claimed && styles.missionProgressComplete,
                    ]}
                  >
                    {mission.claimed
                      ? "수령 완료"
                      : mission.completed
                        ? "수령 가능"
                        : `${mission.progress}/${mission.target}${mission.unit}`}
                  </Text>
                </View>
                <Text style={styles.missionPreviewDescription}>
                  {mission.description}
                </Text>
                <MissionProgressTrack
                  value={mission.progress}
                  max={mission.target}
                  markerValues={markerValues}
                  completedMarkerValues={steps
                    .filter((step) => step.claimed)
                    .map((step) => step.target)}
                  accessibilityLabel={`${mission.title} 진행도 ${mission.progress}/${mission.target}${mission.unit}`}
                  representativeSlime={representativeSlime}
                />
                <View style={styles.readingMilestones}>
                  {steps.map((step) => {
                    const canClaim = step.claimable && !claiming;
                    return (
                      <View key={step.unit} style={styles.readingMilestone}>
                        <Text
                          style={styles.readingMilestoneLabel}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.75}
                        >
                          {readingMissionBoundaryLabel(mission, step.target)}
                        </Text>
                        <ReadingRewardCoinAmount amount={step.amount} />
                        {step.claimed ? (
                          <Text style={styles.rewardClaimedLabel}>
                            수령 완료
                          </Text>
                        ) : (
                          <ReadingRewardClaimButton
                            disabled={!canClaim}
                            muted={!canClaim}
                            onPress={() => onClaim(mission.key, step.unit)}
                            label={`${mission.title} ${step.target}${mission.unit} 보상 ${numberFormatter.format(step.amount)}원${canClaim ? " 수령" : " 아직 수령할 수 없음"}`}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          );
        })}
      </View>
      {claimError ? <Text style={styles.error}>{claimError}</Text> : null}
    </View>
  );
}
