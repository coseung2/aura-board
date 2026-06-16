import { StyleSheet, Text, View } from "react-native";
import { colors, radii, shadows, spacing, typography } from "../../theme/tokens";
import type { StudentPlantDTO, StageDTO } from "../../lib/types";

interface Props {
  plant: StudentPlantDTO;
  currentStage: StageDTO;
  progressPercent: number;
  totalObservations: number;
  totalPhotos: number;
  daysSinceLastObs: number | null;
}

function formatLastObserved(days: number | null): string {
  if (days === null) return "첫 관찰 대기";
  if (days === 0) return "오늘 관찰 완료";
  return `${days}일 전 관찰`;
}

/**
 * 식물 관찰 히어로 섹션 — 식물 정보, 진행률, 통계, 이번 주 미션.
 * 웹의 .plant-student-hero 와 동일한 정보 계층.
 */
export function PlantHero({
  plant,
  currentStage,
  progressPercent,
  totalObservations,
  totalPhotos,
  daysSinceLastObs,
}: Props) {
  const stagePoints = Array.isArray(currentStage.observationPoints)
    ? currentStage.observationPoints
    : [];
  const missionPoints =
    stagePoints.length > 0
      ? stagePoints
      : ["줄기, 잎, 색깔 중 달라진 점 찾기", "사진 1장 이상 올리기", "한 문장으로 변화 기록하기"];

  return (
    <View style={styles.hero}>
      {/* 메인 카드 */}
      <View style={styles.mainCard}>
        <Text style={styles.eyebrow}>관찰 로드맵</Text>
        <View style={styles.titleRow}>
          <Text style={styles.emoji}>{plant.species.emoji}</Text>
          <View style={styles.titleText}>
            <Text style={styles.speciesName}>{plant.species.nameKo}</Text>
            <Text style={styles.nickname}>{plant.nickname}</Text>
          </View>
        </View>

        {/* 진행률 바 */}
        <View style={styles.progressWrap}>
          <View style={styles.progressHead}>
            <Text style={styles.progressLabel}>
              {currentStage.order}단계 · {currentStage.nameKo}
            </Text>
            <Text style={styles.progressPercent}>{progressPercent}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>

        {/* 통계 */}
        <View style={styles.statRow}>
          <Text style={styles.stat}>
            <Text style={styles.statBold}>{totalObservations}</Text>개 기록
          </Text>
          <Text style={styles.stat}>
            <Text style={styles.statBold}>{totalPhotos}</Text>장 사진
          </Text>
          <Text style={styles.stat}>
            <Text style={styles.statBold}>{formatLastObserved(daysSinceLastObs)}</Text>
          </Text>
        </View>
      </View>

      {/* 미션 카드 */}
      <View style={styles.missionCard}>
        <Text style={styles.eyebrow}>이번 주 미션</Text>
        <Text style={styles.missionTitle}>
          {currentStage.icon} {currentStage.nameKo} 관찰하기
        </Text>
        {missionPoints.map((point, idx) => (
          <Text key={`mission-${idx}`} style={styles.missionPoint}>
            • {point}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  mainCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.card,
  },
  eyebrow: {
    ...typography.badge,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  emoji: {
    fontSize: 48,
  },
  titleText: {
    flex: 1,
    gap: 2,
  },
  speciesName: {
    ...typography.title,
    color: colors.text,
  },
  nickname: {
    ...typography.body,
    color: colors.textMuted,
  },
  progressWrap: {
    gap: spacing.xs,
  },
  progressHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    ...typography.label,
    color: colors.text,
  },
  progressPercent: {
    ...typography.label,
    color: colors.plantActive,
    fontWeight: "700",
  },
  progressTrack: {
    height: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.plantActive,
    borderRadius: 4,
  },
  statRow: {
    flexDirection: "row",
    gap: spacing.lg,
    flexWrap: "wrap",
  },
  stat: {
    ...typography.micro,
    color: colors.textMuted,
  },
  statBold: {
    fontWeight: "700",
    color: colors.text,
  },
  missionCard: {
    backgroundColor: colors.accentTintedBg,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  missionTitle: {
    ...typography.subtitle,
    color: colors.text,
  },
  missionPoint: {
    ...typography.body,
    color: colors.textMuted,
    paddingLeft: spacing.sm,
  },
});
