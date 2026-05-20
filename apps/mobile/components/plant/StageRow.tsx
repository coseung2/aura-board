import { StyleSheet, Text, View } from "react-native";
import { colors, radii, shadows, spacing, typography } from "../../theme/tokens";
import { StageRail, type StageState } from "./StageRail";
import { ObservationCard } from "./ObservationCard";
import { StageCompare } from "./StageCompare";
import type { StageDTO, ObservationDTO } from "../../lib/types";

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
          state === "active" && styles.bodyActive,
          state === "upcoming" && styles.bodyUpcoming,
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
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>현재</Text>
              </View>
            )}
          </View>
          {stage.description ? (
            <Text style={styles.description}>{stage.description}</Text>
          ) : null}
        </View>

        {/* 관찰 포인트 */}
        {state !== "upcoming" && stage.observationPoints.length > 0 && (
          <View style={styles.points}>
            <Text style={styles.pointsTitle}>관찰 포인트</Text>
            {stage.observationPoints.map((point, idx) => (
              <Text key={`${stage.id}-pt-${idx}`} style={styles.pointItem}>
                • {point}
              </Text>
            ))}
          </View>
        )}

        {/* 관찰 기록 */}
        {state === "upcoming" ? (
          <Text style={styles.emptyText}>아직 도달 전</Text>
        ) : observations.length === 0 ? (
          <Text style={styles.emptyText}>아직 기록이 없어요.</Text>
        ) : (
          <View style={styles.obsGrid}>
            {observations.map((obs) => (
              <ObservationCard
                key={obs.id}
                observation={obs}
                canEdit={canEdit}
                onEdit={() => onEditObservation(obs)}
                onDelete={() => onDeleteObservation(obs)}
                onOpenImage={onOpenImage}
              />
            ))}
          </View>
        )}

        {/* 사진 비교 */}
        {state !== "upcoming" && observations.length > 0 && (
          <StageCompare
            images={observations.flatMap((o) => o.images)}
          />
        )}

        {/* 액션 버튼 */}
        {canEdit && state !== "upcoming" && (
          <View style={styles.actions}>
            <Text
              style={styles.actionPrimary}
              onPress={onAddObservation}
              accessibilityRole="button"
            >
              + 관찰 추가
            </Text>
            {isCurrent && (
              <Text
                style={[styles.actionSecondary, busyAdvance && styles.actionDisabled]}
                onPress={busyAdvance ? undefined : onAdvance}
                accessibilityRole="button"
              >
                다음 단계로 →
              </Text>
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
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  bodyActive: {
    borderColor: colors.plantActive,
    shadowColor: colors.plantActive,
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  bodyUpcoming: {
    opacity: 0.55,
    borderStyle: "dashed" as never, // RN doesn't support dashed natively; fallback to solid
  },
  header: {
    gap: 4,
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  icon: {
    fontSize: 20,
  },
  title: {
    ...typography.section,
    color: colors.text,
  },
  currentBadge: {
    backgroundColor: colors.plantActive,
    borderRadius: 9999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  currentBadgeText: {
    ...typography.badge,
    color: "#ffffff",
  },
  description: {
    ...typography.body,
    color: colors.textMuted,
  },
  points: {
    gap: 4,
    paddingTop: spacing.xs,
  },
  pointsTitle: {
    ...typography.label,
    color: colors.textMuted,
  },
  pointItem: {
    ...typography.body,
    color: colors.text,
    paddingLeft: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.textFaint,
    textAlign: "center",
    paddingVertical: spacing.md,
  },
  obsGrid: {
    gap: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    paddingTop: spacing.sm,
    flexWrap: "wrap",
  },
  actionPrimary: {
    ...typography.label,
    color: "#ffffff",
    backgroundColor: colors.plantActive,
    borderRadius: radii.btn,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    overflow: "hidden",
    textAlign: "center",
  },
  actionSecondary: {
    ...typography.label,
    color: colors.plantActive,
    borderWidth: 1,
    borderColor: colors.plantActive,
    borderRadius: radii.btn,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    overflow: "hidden",
    textAlign: "center",
  },
  actionDisabled: {
    opacity: 0.5,
  },
});
