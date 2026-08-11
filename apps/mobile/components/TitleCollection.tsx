import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { getApiBase } from "../lib/api";
import type { TitleProgress } from "../lib/titles";
import {
  borders,
  colors,
  radii,
  spacing,
  states,
  titleCollection,
  typography,
} from "../theme/tokens";
import { AppButton } from "./ui";

export type { TitleProgress };

const EFFECT_LABELS: Record<string, string> = {
  growth_speed: "성장 속도",
  reading_reward: "독서 보상",
  walking_reward: "걷기 보상",
  assignment_reward: "과제 보상",
  comment_reward: "댓글 보상",
};

type Props = {
  titles: TitleProgress[];
  /** Shown when the student has not earned any title yet. */
  emptyHint: string;
  claimingKey: string | null;
  onClaim: (titleKey: string) => void;
};

/** Shared achievement-title list for the walking and reading mission screens. */
export function TitleCollection({ titles, emptyHint, claimingKey, onClaim }: Props) {
  const claimedCount = titles.filter((title) => title.claimed).length;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>칭호</Text>
        <Text style={styles.count}>
          {claimedCount} / {titles.length}
        </Text>
      </View>

      {claimedCount === 0 ? (
        <Text style={styles.emptyHint}>{emptyHint}</Text>
      ) : null}

      <View accessibilityRole="list">
        {titles.map((title) => {
          const claimable = title.earned && !title.claimed;
          const effectLabel = EFFECT_LABELS[title.effectKey] ?? "보상";
          const buffText = `${effectLabel} +${title.buffBps / 100}%`;
          return (
            <View
              key={title.key}
              style={[styles.row, claimable && styles.rowClaimable]}
              accessible
              accessibilityRole="summary"
              accessibilityLabel={`${title.label} 칭호, ${title.requirement}, ${buffText}, ${
                title.claimed ? "수령 완료" : claimable ? "수령 가능" : "미달성"
              }`}
            >
              <View style={[styles.tag, !title.earned && styles.tagLocked]}>
                <Image
                  source={{
                    uri: title.imagePath.startsWith("http")
                      ? title.imagePath
                      : `${getApiBase()}${title.imagePath}`,
                  }}
                  style={styles.tagImage}
                  contentFit="contain"
                  accessible={false}
                />
              </View>
              <View style={styles.meta}>
                <Text style={styles.requirement}>{title.requirement}</Text>
                <Text style={[styles.state, claimable && styles.stateClaimable]}>
                  {title.claimed ? "수령 완료" : claimable ? "수령 가능" : "미달성"}
                  {" · "}
                  {buffText}
                </Text>
              </View>
              {claimable ? (
                <View style={styles.action}>
                  <AppButton
                    loading={claimingKey === title.key}
                    onPress={() => onClaim(title.key)}
                    accessibilityLabel={`${title.label} 칭호 수령`}
                  >
                    받기
                  </AppButton>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  title: { ...typography.section, color: colors.text },
  count: { ...typography.label, color: colors.accentTintedText },
  emptyHint: { ...typography.body, color: colors.textMuted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  // Claimable titles are highlighted the same way as claimable attendance days.
  rowClaimable: {
    paddingHorizontal: spacing.sm,
    borderRadius: radii.btn,
    backgroundColor: colors.accentTintedBg,
  },
  tag: {
    width: titleCollection.tagWidth,
    height: titleCollection.tagHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  // Unearned titles stay readable so students can see what to aim for.
  tagLocked: { opacity: states.disabledOpacity },
  tagImage: { width: "100%", height: "100%" },
  meta: { flex: 1, minWidth: 0, gap: spacing.xxs },
  requirement: { ...typography.body, color: colors.text },
  state: { ...typography.micro, color: colors.textMuted },
  stateClaimable: { color: colors.accentTintedText },
  action: { minWidth: titleCollection.actionWidth },
});
