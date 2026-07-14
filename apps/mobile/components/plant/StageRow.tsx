import { StyleSheet, Text, View } from "react-native";
import {
  borders,
  colors,
  iconSizes,
  plant,
  spacing,
  states,
  typography,
} from "../../theme/tokens";
import { StageRail, type StageState } from "./StageRail";
import { ObservationCard } from "./ObservationCard";
import { StageCompare } from "./StageCompare";
import type { StageDTO, ObservationDTO } from "../../lib/types";
import { AppButton, Pill } from "../ui";

interface Props {
  stage: StageDTO;
  state: StageState;
  isFirst: boolean;
  isLast: boolean;
  isCurrent: boolean;
  observations: ObservationDTO[];
  canEdit: boolean;
  onAddObservation: () => void;
  onEditObservation: (obs: ObservationDTO) => void;
  onDeleteObservation: (obs: ObservationDTO) => void;
  onAdvance: () => void;
  onOpenImage: (url: string) => void;
  busyAdvance: boolean;
}

/**
 * 세로 타임라인의 한 행 — 좌측 레일 + 우측 바디.
 * 웹의 .plant-stage-row 와 동일한 구조.
 */
export function StageRow({
  stage,
  state,
  isFirst,
  isLast,
  isCurrent,
  observations,
  canEdit,
  onAddObservation,
  onEditObservation,
  onDeleteObservation,
  onAdvance,
  onOpenImage,
  busyAdvance,
}: Props) {
  return (
    <View style={styles.row}>
      <StageRail
        order={stage.order}
        state={state}
        isFirst={isFirst}
        isLast={isLast}
      />
      <View
        style={[
          styles.body,
          state === "upcoming" && styles.bodyUpcoming,
          isLast && styles.bodyLast,
        ]}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <Text style={styles.icon}>{stage.icon}</Text>
            <Text style={styles.title}>
              {stage.order}단계 · {stage.nameKo}
            </Text>
            {isCurrent && (
              <Pill tone="accent" textStyle={styles.currentBadgeText}>
                현재
              </Pill>
            )}
          </View>
          {stage.description ? (
            <Text style={styles.description}>{stage.description}</Text>
          ) : null}
        </View>

        {/* 관찰 기록 */}
        {state === "upcoming" ? (
          <Text style={styles.emptyText}>아직 도달 전</Text>
        ) : observations.length === 0 ? (
          <Text style={styles.emptyText}>아직 기록이 없어요.</Text>
        ) : (
          <View style={styles.observationStream}>
            {observations.map((obs) => (
              <View key={obs.id} style={styles.observationItem}>
                <ObservationCard
                  observation={obs}
                  canEdit={canEdit}
                  onEdit={() => onEditObservation(obs)}
                  onDelete={() => onDeleteObservation(obs)}
                  onOpenImage={onOpenImage}
                />
              </View>
            ))}
          </View>
        )}

        {/* 사진 비교 */}
        {state !== "upcoming" && observations.length > 0 && (
          <StageCompare images={observations.flatMap((o) => o.images)} />
        )}

        {/* 액션 버튼 */}
        {canEdit && state !== "upcoming" && (
          <View style={styles.actions}>
            <AppButton variant="success" onPress={onAddObservation}>
              + 관찰 추가
            </AppButton>
            {isCurrent && (
              <AppButton
                variant="secondary"
                textStyle={styles.actionSecondaryText}
                style={styles.actionSecondary}
                onPress={busyAdvance ? undefined : onAdvance}
                disabled={busyAdvance}
              >
                다음 단계로 →
              </AppButton>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  body: {
    flex: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  bodyUpcoming: {
    opacity: states.disabledOpacity,
  },
  bodyLast: {
    borderBottomWidth: borders.none,
  },
  header: {
    gap: spacing.xs,
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  icon: {
    fontSize: iconSizes.md,
  },
  title: {
    ...typography.section,
    color: colors.text,
  },
  currentBadgeText: {
    ...typography.badge,
    color: colors.accentTintedText,
  },
  description: {
    ...typography.body,
    color: colors.textMuted,
  },
  emptyText: {
    ...typography.body,
    color: colors.textFaint,
    textAlign: "center",
    paddingVertical: spacing.md,
  },
  observationStream: { gap: spacing.md },
  observationItem: { width: "100%" },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    paddingTop: spacing.sm,
    flexWrap: "wrap",
  },
  actionSecondary: {
    borderColor: colors.plantActive,
  },
  actionSecondaryText: {
    ...typography.label,
    color: colors.plantActive,
  },
  actionDisabled: {
    opacity: states.disabledOpacity,
  },
});
