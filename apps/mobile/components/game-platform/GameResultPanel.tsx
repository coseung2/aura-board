import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MobileGameOutcome } from "../../lib/game-platform-contract";
import { mobileOutcomeLabel } from "../../lib/game-platform";
import {
  borders,
  colors,
  gamePlatform,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";

export type MobileGameResultMetric = {
  label: string;
  value: ReactNode;
};

export type MobileGameResultPanelProps = {
  outcome: MobileGameOutcome;
  score?: number | null;
  durationMs?: number | null;
  metrics?: readonly MobileGameResultMetric[];
  message?: string | null;
  resultId?: string | null;
  actions?: ReactNode;
};

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

export function GameResultPanel({
  outcome,
  score,
  durationMs,
  metrics = [],
  message,
  resultId,
  actions,
}: MobileGameResultPanelProps) {
  return (
    <View style={styles.root} accessibilityRole="summary">
      <Text selectable style={styles.eyebrow}>RESULT</Text>
      <Text selectable style={styles.outcome}>{mobileOutcomeLabel(outcome)}</Text>
      {message ? <Text selectable style={styles.message}>{message}</Text> : null}
      <View style={styles.metricGrid}>
        {score != null ? (
          <View style={styles.metric}>
            <Text selectable style={styles.metricLabel}>점수</Text>
            <Text selectable style={[styles.metricValue, styles.tabular]}>
              {score.toLocaleString("ko-KR")}
            </Text>
          </View>
        ) : null}
        {durationMs != null ? (
          <View style={styles.metric}>
            <Text selectable style={styles.metricLabel}>진행 시간</Text>
            <Text selectable style={[styles.metricValue, styles.tabular]}>
              {formatDuration(durationMs)}
            </Text>
          </View>
        ) : null}
        {metrics.map((metric) => (
          <View style={styles.metric} key={metric.label}>
            <Text selectable style={styles.metricLabel}>{metric.label}</Text>
            {typeof metric.value === "string" || typeof metric.value === "number" ? (
              <Text selectable style={styles.metricValue}>{metric.value}</Text>
            ) : (
              metric.value
            )}
          </View>
        ))}
      </View>
      {resultId ? (
        <Text selectable style={styles.resultId}>기록 번호 {resultId}</Text>
      ) : null}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
    padding: spacing.xl,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
  },
  eyebrow: { ...typography.micro, color: colors.textMuted },
  outcome: { ...typography.display, color: colors.text },
  message: { ...typography.body, color: colors.textMuted },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  metric: {
    minWidth: gamePlatform.metricMinWidth,
    flexGrow: 1,
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderCurve: "continuous",
    backgroundColor: colors.bg,
  },
  metricLabel: { ...typography.micro, color: colors.textMuted },
  metricValue: { ...typography.subtitle, color: colors.text },
  resultId: { ...typography.micro, color: colors.textFaint },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tabular: { fontVariant: ["tabular-nums"] },
});
