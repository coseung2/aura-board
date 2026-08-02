import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MobileGameConnectionState } from "../../lib/game-platform";
import {
  borders,
  colors,
  controls,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import { AppButton } from "../ui";

export type MobileGameHudProps = {
  title: string;
  roundLabel?: string | null;
  timeLeftMs?: number | null;
  score?: number | null;
  scoreLabel?: string;
  connection?: MobileGameConnectionState;
  rulesLabel?: string | null;
  exitLabel?: string;
  onExit?: (() => void) | null;
  actions?: ReactNode;
};

function timeLabel(timeLeftMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(timeLeftMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function connectionLabel(connection: MobileGameConnectionState): string {
  if (connection === "online") return "연결됨";
  if (connection === "reconnecting") return "다시 연결 중";
  return "오프라인";
}

export function GameHud({
  title,
  roundLabel,
  timeLeftMs,
  score,
  scoreLabel = "점수",
  connection = "online",
  rulesLabel,
  exitLabel = "나가기",
  onExit,
  actions,
}: MobileGameHudProps) {
  return (
    <View style={styles.root} accessibilityRole="header">
      <Text selectable style={styles.title}>{title}</Text>
      <View style={styles.metaRow}>
        {roundLabel ? <Text selectable style={styles.badge}>{roundLabel}</Text> : null}
        {timeLeftMs != null ? (
          <Text selectable style={[styles.badge, styles.tabular]}>{timeLabel(timeLeftMs)}</Text>
        ) : null}
        {score != null ? (
          <Text selectable style={[styles.badge, styles.tabular]}>
            {scoreLabel} {score.toLocaleString("ko-KR")}
          </Text>
        ) : null}
        <View style={styles.connectionBadge} accessibilityLiveRegion="polite">
          <View
            style={[
              styles.dot,
              connection === "reconnecting" && styles.warningDot,
              connection === "offline" && styles.offlineDot,
            ]}
          />
          <Text selectable style={styles.badgeText}>{connectionLabel(connection)}</Text>
        </View>
        {rulesLabel ? <Text selectable style={styles.badge}>{rulesLabel}</Text> : null}
      </View>
      <View style={styles.actionRow}>
        {actions}
        {onExit ? (
          <AppButton
            onPress={onExit}
            style={styles.exitButton}
            textStyle={styles.exitText}
            variant="quiet"
          >
            {exitLabel}
          </AppButton>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.gameFrame,
  },
  title: { ...typography.title, color: colors.onAccent },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    alignItems: "center",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    alignItems: "center",
  },
  badge: {
    ...typography.badge,
    color: colors.onAccent,
    backgroundColor: colors.gameHudBadge,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  connectionBadge: {
    minHeight: controls.compactChipHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.gameHudBadge,
  },
  badgeText: { ...typography.badge, color: colors.onAccent },
  dot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.statusOnline,
  },
  warningDot: { backgroundColor: colors.warning },
  offlineDot: { backgroundColor: colors.danger },
  exitButton: {
    justifyContent: "center",
    borderWidth: borders.hairline,
    borderColor: colors.gameHudBorder,
    borderRadius: radii.control,
    paddingHorizontal: spacing.lg,
  },
  exitText: { ...typography.label, color: colors.onAccent },
  tabular: { fontVariant: ["tabular-nums"] },
});
