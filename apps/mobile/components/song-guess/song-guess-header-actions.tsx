import { ArrowLeft, LogOut, X } from "lucide-react-native";
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
}: Props) {
  return (
    <View style={styles.row}>
      <LobbyBackgroundMusic
        active={musicActive}
        iconOnly
        iconTone={{ on: song.accent, off: song.muted }}
      />
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
