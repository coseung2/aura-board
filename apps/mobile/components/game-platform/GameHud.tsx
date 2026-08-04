import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { colors, layers, spacing } from "../../theme/tokens";
import { AppButton } from "../ui";

export type MobileGameHudProps = {
  title?: string | null;
  roundLabel?: string | null;
  timeLeftMs?: number | null;
  score?: number | null;
  scoreLabel?: string;
  connection?: string;
  rulesLabel?: string | null;
  exitLabel?: string;
  onExit?: (() => void) | null;
  actions?: ReactNode;
};

export function GameHud({
  exitLabel = "나가기",
  onExit,
  actions,
}: MobileGameHudProps) {
  if (!onExit && !actions) return null;
  return (
    <View style={styles.root} accessibilityRole="toolbar">
      <View style={styles.actions}>
        {actions}
        {onExit ? (
          <AppButton onPress={onExit} variant="quiet" style={styles.exitButton}>
            {exitLabel}
          </AppButton>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: layers.overlayControl,
    padding: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "flex-end",
  },
  exitButton: {
    backgroundColor: colors.transparent,
  },
});
