import { Text, View } from "react-native";
import type { SongGuessSnapshot } from "../../lib/song-guess-contract";
import { formatClipLabel, formatSeconds } from "../../lib/song-guess";
import { AppButton } from "../ui";
import { songGuessBoardStyles as styles } from "./songGuessBoardStyles";

type Clip = NonNullable<SongGuessSnapshot["currentRound"]["currentClip"]>;

type Props = {
  clip: Clip;
  answerPrompt: string;
  muted: boolean;
  loaded: boolean;
  playing: boolean;
  preparing: boolean;
  failed: boolean;
  currentTime: number;
  progress: number;
  onPlay: () => void;
  onPause: () => void;
  onToggleMute: () => void;
};

/** The round's audio player: one disc control, the clip length, the running
 * time and the mute/pause actions. Rounds autoplay, so this card is mostly a
 * replay and pause affordance. */
export function SongGuessPlayerCard({
  clip,
  answerPrompt,
  muted,
  loaded,
  playing,
  preparing,
  failed,
  currentTime,
  progress,
  onPlay,
  onPause,
  onToggleMute,
}: Props) {
  return (
    <View style={styles.playerCard}>
      <View style={styles.playerMainRow}>
        <View style={styles.recordDisc}>
          <AppButton
            style={styles.recordButton}
            textStyle={styles.recordButtonText}
            loading={preparing}
            disabled={!loaded || failed}
            onPress={onPlay}
            accessibilityLabel={playing ? "노래 다시 듣기" : "노래 듣기"}
          >
            {playing ? "↻" : "▶"}
          </AppButton>
        </View>
        <View style={styles.playerInfo}>
          <Text style={styles.playerDuration}>{formatClipLabel(clip.tierMs)}</Text>
          <Text style={styles.questionText}>{`이 노래의 ${answerPrompt}은?`}</Text>
          <Text style={styles.playerTime}>
            {formatSeconds(currentTime)} / {formatSeconds(clip.durationMs / 1000)}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>
      </View>
      <View style={styles.playerActions}>
        {playing ? (
          <AppButton
            style={styles.secondaryPlayerButton}
            textStyle={styles.secondaryPlayerButtonText}
            variant="secondary"
            onPress={onPause}
          >
            일시정지
          </AppButton>
        ) : null}
        <AppButton
          style={styles.secondaryPlayerButton}
          textStyle={styles.secondaryPlayerButtonText}
          variant="secondary"
          onPress={onToggleMute}
        >
          {muted ? "소리 켜기" : "음소거"}
        </AppButton>
      </View>
    </View>
  );
}
