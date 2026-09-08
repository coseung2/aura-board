import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../ui";
import { borders, radii, spacing, typography } from "../../theme/tokens";
import { songGuessStudentTheme as song } from "../../theme/song-guess";

type Props = {
  joined: boolean;
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
};

export function SongGuessLobbyStatus({ joined, pending, failed, onRetry }: Props) {
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <Text style={styles.title} selectable>
        {joined ? "게임에 입장했어요" : failed ? "입장하지 못했어요" : "게임에 입장하는 중이에요"}
      </Text>
      <Text style={styles.muted} selectable>
        {joined ? "선생님의 시작을 기다려 주세요." : failed ? "다시 시도해 주세요." : "잠시만 기다려 주세요."}
      </Text>
      {!joined ? (
        <>
          <Text style={styles.status} selectable>
            {pending ? "입장 중…" : failed ? "입장하지 못했어요." : "입장 준비 중…"}
          </Text>
          {failed ? (
            <AppButton
              variant="secondary"
              style={styles.retryButton}
              textStyle={styles.retryButtonText}
              onPress={onRetry}
              accessibilityLabel="게임 입장 다시 시도"
            >
              다시 시도
            </AppButton>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: song.panelRadius,
    borderCurve: "continuous",
    backgroundColor: song.surface,
    borderWidth: borders.hairline,
    borderColor: song.border,
    alignItems: "center",
  },
  title: { ...typography.title, color: song.text, textAlign: "center" },
  muted: { ...typography.body, color: song.muted, textAlign: "center" },
  status: { ...typography.label, color: song.accent, textAlign: "center" },
  retryButton: { borderRadius: radii.control, borderColor: song.borderStrong, backgroundColor: song.track },
  retryButtonText: { color: song.text },
});
