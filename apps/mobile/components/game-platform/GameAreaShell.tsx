import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { MobileGameConnectionState } from "../../lib/game-platform";
import {
  borders,
  colors,
  gamePlatform,
  layers,
  radii,
  shadows,
  spacing,
  typography,
} from "../../theme/tokens";
import { GameHud, type MobileGameHudProps } from "./GameHud";

export type MobileGameAreaShellProps = Omit<MobileGameHudProps, "connection"> & {
  children: ReactNode;
  connection?: MobileGameConnectionState;
  inputLocked?: boolean;
  statusMessage?: string | null;
  hostControls?: ReactNode;
  participantActions?: ReactNode;
  scrollEnabled?: boolean;
};

export function GameAreaShell({
  children,
  connection = "online",
  inputLocked = false,
  statusMessage,
  hostControls,
  participantActions,
  scrollEnabled = true,
  ...hudProps
}: MobileGameAreaShellProps) {
  const locked = inputLocked || connection !== "online";
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      scrollEnabled={scrollEnabled}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.scrollContent}
      style={styles.scroll}
    >
      <View style={styles.frame} accessibilityState={{ busy: locked }}>
        <GameHud {...hudProps} connection={connection} />
        <View style={styles.playfield}>
          {hostControls ? (
            <View style={styles.zone} accessibilityLabel="진행자 조작">
              <Text selectable style={styles.zoneLabel}>진행자 조작</Text>
              {hostControls}
            </View>
          ) : null}
          {participantActions ? (
            <View style={styles.zone} accessibilityLabel="참가자 조작">
              <Text selectable style={styles.zoneLabel}>참가자 조작</Text>
              {participantActions}
            </View>
          ) : null}
          {children}
          {locked ? (
            <View style={styles.lockOverlay} accessibilityLiveRegion="polite">
              <View style={styles.lockCard}>
                <Text selectable style={styles.lockTitle}>
                  {connection === "offline" ? "연결이 끊겼어요" : "최신 상태를 확인 중이에요"}
                </Text>
                <Text selectable style={styles.lockText}>
                  {statusMessage ??
                    "입력은 잠시 잠겨요. 연결이 복구되면 서버의 최신 상태를 다시 불러옵니다."}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.gameCanvas },
  scrollContent: { flexGrow: 1, padding: spacing.md },
  frame: {
    flexGrow: 1,
    overflow: "hidden",
    borderWidth: borders.hairline,
    borderColor: colors.gameFrameBorder,
    borderRadius: radii.card,
    backgroundColor: colors.gameFrame,
    borderCurve: "continuous",
    ...shadows.gameFrame,
  },
  playfield: {
    position: "relative",
    flexGrow: 1,
    gap: spacing.md,
    minHeight: gamePlatform.playfieldMinHeight,
    padding: spacing.lg,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.gamePlayfield,
  },
  zone: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
  },
  zoneLabel: { ...typography.micro, color: colors.textMuted, textTransform: "uppercase" },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: layers.bottomNav,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.gamePlayfieldOverlay,
  },
  lockCard: {
    width: "100%",
    maxWidth: gamePlatform.lockCardMaxWidth,
    gap: spacing.sm,
    padding: spacing.xl,
    borderWidth: borders.hairline,
    borderColor: colors.warning,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.warningTintedBg,
  },
  lockTitle: { ...typography.subtitle, color: colors.text },
  lockText: { ...typography.body, color: colors.textMuted },
});
