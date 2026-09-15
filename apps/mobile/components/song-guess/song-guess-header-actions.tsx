import { ArrowLeft, LogOut, Volume2, VolumeX, X } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { iconSizes, radii, spacing } from "../../theme/tokens";
import { songGuessStudentTheme as song } from "../../theme/song-guess";
import { LobbyBackgroundMusic } from "../game-platform/LobbyBackgroundMusic";
import { IconButton } from "../ui";

type ExitKind = "finish" | "leave" | "back";

type Props = {
  /** Lobby background music is only offered while the lobby is open. */
  musicActive: boolean;
  exitKind: ExitKind;
  exitLabel: string;
  onExit: () => void;
  disabled?: boolean;
  roundAudioActive?: boolean;
  muted?: boolean;
  onToggleMute?: () => void;
};

/** Compact top-right controls for the song-guess lobby and rounds. The room
 * host only gets "게임 끝내기" because leaving already ends the room, and the
 * music toggle belongs next to it instead of in its own labelled row. */
export function SongGuessHeaderActions({
  musicActive,
  exitKind,
  exitLabel,
  onExit,
  disabled = false,
  roundAudioActive = false,
  muted = false,
  onToggleMute,
}: Props) {
  return (
    <View style={styles.row}>
      {roundAudioActive && onToggleMute ? (
        <IconButton accessibilityLabel={muted ? "소리 켜기" : "음소거"} onPress={onToggleMute}>
          {muted ? <VolumeX size={iconSizes.md} color={song.muted} accessible={false} />
            : <Volume2 size={iconSizes.md} color={song.accent} accessible={false} />}
        </IconButton>
      ) : musicActive ? (
        <LobbyBackgroundMusic active iconOnly iconTone={{ on: song.accent, off: song.muted }} />
      ) : null}
      <IconButton
        accessibilityLabel={exitLabel}
        disabled={disabled}
        onPress={onExit}
      >
        {exitKind === "finish" ? (
          <X size={iconSizes.md} color={song.muted} strokeWidth={2} accessible={false} />
        ) : exitKind === "back" ? (
          <ArrowLeft size={iconSizes.md} color={song.muted} strokeWidth={2} accessible={false} />
        ) : (
          <LogOut size={iconSizes.md} color={song.muted} strokeWidth={2} accessible={false} />
        )}
      </IconButton>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xxs,
    alignSelf: "flex-end",
    paddingHorizontal: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: song.track,
  },
});
