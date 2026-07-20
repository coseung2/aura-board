import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { borders, colors, iconSizes, plant, radii, spacing, typography } from "../../theme/tokens";
import type { StageDTO } from "../../lib/types";
import { AppButton, AppModal, ControlPressable } from "../ui";
import { normalizeObservationPoints } from "./plant-roadmap-utils";

interface Props {
  stages: StageDTO[];
  currentStage: StageDTO;
}

/** Horizontal stage navigation plus the observation-point detail modal. */
export function RoadmapStagePicker({ stages, currentStage }: Props) {
  const [selectedStage, setSelectedStage] = useState<StageDTO | null>(null);
  const selectedPoints = useMemo(
    () => normalizeObservationPoints(selectedStage?.observationPoints),
    [selectedStage],
  );

  return (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🛣️ 성장 로드맵</Text>
        <Text style={styles.hint}>
          단계를 누르면 주요 관찰 포인트를 볼 수 있어요.
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.track}
        >
          {stages.map((stage, index) => {
            const isComplete = stage.order < currentStage.order;
            const isCurrent = stage.id === currentStage.id;
            return (
              <View key={stage.id} style={styles.stepWrap}>
                <ControlPressable
                  onPress={() => setSelectedStage(stage)}
                  accessibilityLabel={`${stage.order}단계 ${stage.nameKo} 관찰 포인트`}
                  style={[
                    styles.step,
                    isComplete && styles.stepComplete,
                    isCurrent && styles.stepCurrent,
                  ]}
                >
                  <Text style={styles.stepIcon}>{stage.icon}</Text>
                  <Text style={styles.stepLabel} numberOfLines={1}>
                    {stage.order}단계
                  </Text>
                </ControlPressable>
                {index < stages.length - 1 ? (
                  <View
                    style={[
                      styles.connector,
                      isComplete && styles.connectorComplete,
                    ]}
                  />
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </View>

      <AppModal
        visible={selectedStage !== null}
        onClose={() => setSelectedStage(null)}
        closeOnBackdropPress
        accessibilityLabel="단계별 주요 관찰 포인트"
      >
        {selectedStage ? (
          <View style={styles.detailModal}>
            <Text style={styles.detailTitle}>
              {selectedStage.icon} {selectedStage.order}단계 · {selectedStage.nameKo}
            </Text>
            {selectedStage.description ? (
              <Text style={styles.detailDescription}>{selectedStage.description}</Text>
            ) : null}
            <Text style={styles.detailLabel}>주요 관찰 포인트</Text>
            {selectedPoints.length > 0 ? (
              selectedPoints.map((point, index) => (
                <Text key={`${selectedStage.id}-${index}`} style={styles.detailPoint}>
                  • {point}
                </Text>
              ))
            ) : (
              <Text style={styles.detailEmpty}>등록된 주요 관찰 포인트가 없어요.</Text>
            )}
            <AppButton onPress={() => setSelectedStage(null)}>닫기</AppButton>
          </View>
        ) : null}
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
    marginBottom: spacing.md,
  },
  hint: {
    ...typography.micro,
    color: colors.textMuted,
  },
  track: {
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  stepWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  step: {
    width: plant.roadmapStepWidth,
    minHeight: plant.roadmapStepMinHeight,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    padding: spacing.xs,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  stepComplete: { backgroundColor: colors.accentTintedBg },
  stepCurrent: { backgroundColor: colors.accent },
  stepIcon: { fontSize: iconSizes.md },
  stepLabel: { ...typography.micro, color: colors.text },
  connector: {
    width: spacing.lg,
    height: borders.medium,
    backgroundColor: colors.border,
  },
  connectorComplete: { backgroundColor: colors.accent },
  detailModal: {
    gap: spacing.md,
    padding: spacing.xl,
  },
  detailTitle: { ...typography.title, color: colors.text },
  detailDescription: { ...typography.body, color: colors.textMuted },
  detailLabel: { ...typography.label, color: colors.text },
  detailPoint: { ...typography.body, color: colors.text },
  detailEmpty: { ...typography.body, color: colors.textMuted },
});
