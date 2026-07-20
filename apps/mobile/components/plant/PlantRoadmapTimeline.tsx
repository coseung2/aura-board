import { StyleSheet, Text, View } from "react-native";
import { borders, colors, controls, spacing, typography } from "../../theme/tokens";
import type { ObservationDTO, StageDTO } from "../../lib/types";
import { StageRow } from "./StageRow";
import type { StageState } from "./StageRail";

interface Props {
  stages: StageDTO[];
  currentStage: StageDTO;
  observationsByStage: Map<string, ObservationDTO[]>;
  daysSinceLastObs: number | null;
  busyAdvance: boolean;
  onOpenEditor: (stageId: string, observation?: ObservationDTO) => void;
  onDeleteObservation: (observation: ObservationDTO) => void;
  onAdvance: () => void;
  onOpenImage: (url: string) => void;
}

/** Stage list kept separate from board-level mutation and modal state. */
export function PlantRoadmapTimeline({
  stages,
  currentStage,
  observationsByStage,
  daysSinceLastObs,
  busyAdvance,
  onOpenEditor,
  onDeleteObservation,
  onAdvance,
  onOpenImage,
}: Props) {
  return (
    <View style={styles.root}>
      <Text style={styles.sectionTitle}>관찰 기록</Text>
      {stages.map((stage, index) => {
        const state: StageState =
          stage.order < currentStage.order
            ? "visited"
            : stage.order === currentStage.order
              ? "active"
              : "upcoming";
        const observations = observationsByStage.get(stage.id) ?? [];
        const isCurrent = stage.id === currentStage.id;

        return (
          <View key={stage.id} style={styles.stageGroup}>
            <View
              style={[
                styles.stageHighlight,
                state === "visited" && styles.stageHighlightVisited,
                state === "active" && styles.stageHighlightActive,
              ]}
            >
              <Text style={styles.stageHighlightText}>
                {stage.order}단계 · {stage.nameKo}
              </Text>
            </View>
            <StageRow
              stage={stage}
              state={state}
              isFirst={index === 0}
              isLast={index === stages.length - 1}
              isCurrent={isCurrent}
              observations={observations}
              daysSinceLastObs={daysSinceLastObs}
              canEdit={state !== "upcoming"}
              onAddObservation={() => onOpenEditor(stage.id)}
              onEditObservation={(observation) => onOpenEditor(stage.id, observation)}
              onDeleteObservation={onDeleteObservation}
              onAdvance={onAdvance}
              onOpenImage={onOpenImage}
              busyAdvance={busyAdvance}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
    marginBottom: spacing.md,
  },
  stageGroup: { gap: spacing.sm },
  stageHighlight: {
    minHeight: controls.compactChipHeight,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderLeftWidth: borders.medium,
    borderLeftColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  stageHighlightVisited: { borderLeftColor: colors.plantActive },
  stageHighlightActive: {
    borderLeftColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  stageHighlightText: { ...typography.label, color: colors.text },
});
