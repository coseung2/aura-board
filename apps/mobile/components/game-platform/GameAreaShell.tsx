import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { MobileGameConnectionState } from "../../lib/game-platform";
import {
  colors,
  layers,
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
  scrollEnabled: _scrollEnabled = true,
  ...hudProps
}: MobileGameAreaShellProps) {
  const locked = inputLocked || connection !== "online";
  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} accessibilityState={{ busy: locked }}>
      <GameHud {...hudProps} connection={connection} />
      <View style={styles.playfield}>
        {hostControls ? <View style={styles.zone}>{hostControls}</View> : null}
        {participantActions ? <View style={styles.zone}>{participantActions}</View> : null}
        <View style={styles.content}>{children}</View>
        {locked ? (
          <View style={styles.lockOverlay} accessibilityLiveRegion="polite">
            <Text selectable style={styles.lockText}>
              {statusMessage ??
                (connection === "offline"
                  ? "연결이 끊겼어요"
                  : "최신 상태를 확인 중이에요")}
            </Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  playfield: {
    position: "relative",
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
  },
  zone: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: layers.bottomNav,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.bg,
  },
  lockText: {
    ...typography.body,
    color: colors.text,
    textAlign: "center",
  },
});
