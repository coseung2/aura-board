import * as SecureStore from "expo-secure-store";
import { useAudioPlayer } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { Volume2, VolumeX } from "lucide-react-native";
import {
  colors,
  iconSizes,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { ControlPressable, IconButton } from "../ui";

const LOBBY_MUSIC_MUTED_KEY = "aura.gameLobbyMusic.muted.v1";
const LOBBY_MUSIC = require("../../assets/sounds/game-lobby/menu.ogg") as number;

export function LobbyBackgroundMusic({
  active = true,
  iconOnly = false,
  iconTone,
}: {
  active?: boolean;
  /** Compact header toggle. The labelled row is still used by game lobbies
   * whose header has room for explanatory text. */
  iconOnly?: boolean;
  /** Icon colors for the compact toggle so boards with their own palette keep
   * contrast. Defaults to the shared app palette. */
  iconTone?: { on: string; off: string };
}) {
  const player = useAudioPlayer(LOBBY_MUSIC, { downloadFirst: true });
  const [muted, setMuted] = useState(true);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const appStateRef = useRef(AppState.currentState);

  const syncPlayback = useCallback(() => {
    try {
      player.loop = true;
      player.volume = 0.22;
      player.muted = muted;
      if (active && preferenceLoaded && !muted && appStateRef.current === "active") {
        player.play();
      } else {
        player.pause();
      }
    } catch {
      // Lobby music is optional and must never block the game lobby.
    }
  }, [active, muted, player, preferenceLoaded]);

  useEffect(() => {
    let cancelled = false;
    void SecureStore.getItemAsync(LOBBY_MUSIC_MUTED_KEY)
      .then((saved) => {
        if (!cancelled) setMuted(saved === "1");
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setPreferenceLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    syncPlayback();
  }, [syncPlayback]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
      syncPlayback();
    });
    return () => subscription.remove();
  }, [syncPlayback]);

  useEffect(
    () => () => {
      try {
        player.pause();
      } catch {}
    },
    [player],
  );

  const toggleMuted = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    void SecureStore.setItemAsync(LOBBY_MUSIC_MUTED_KEY, nextMuted ? "1" : "0").catch(
      () => undefined,
    );
  };

  if (!active) return null;

  const toggleLabel = muted ? "로비 배경음 켜기" : "로비 배경음 끄기";

  if (iconOnly) {
    const tone = iconTone ?? { on: colors.text, off: colors.textMuted };
    return (
      <IconButton
        accessibilityRole="switch"
        accessibilityLabel={toggleLabel}
        accessibilityState={{ checked: !muted }}
        onPress={toggleMuted}
      >
        {muted ? (
          <VolumeX
            size={iconSizes.md}
            color={tone.off}
            strokeWidth={2}
            accessible={false}
          />
        ) : (
          <Volume2
            size={iconSizes.md}
            color={tone.on}
            strokeWidth={2}
            accessible={false}
          />
        )}
      </IconButton>
    );
  }

  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <Text style={styles.label}>로비 배경음</Text>
      <ControlPressable
        accessibilityLabel={toggleLabel}
        accessibilityState={{ checked: !muted }}
        accessibilityRole="switch"
        onPress={toggleMuted}
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>{muted ? "🔇 소리 켜기" : "🔊 재생 중"}</Text>
      </ControlPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
  },
  label: { ...typography.micro, color: colors.textMuted },
  toggle: { minHeight: tapMin, paddingHorizontal: spacing.md },
  toggleText: { ...typography.badge, color: colors.text },
});
