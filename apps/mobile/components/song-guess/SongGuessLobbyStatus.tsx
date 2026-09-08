import { StyleSheet, Text, View } from "react-native";
import { AppButton } from "../ui";
import { borders, colors, radii, spacing, typography } from "../../theme/tokens";

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
            <AppButton variant="secondary" onPress={onRetry} accessibilityLabel="게임 입장 다시 시도">
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
    padding: spacing.lg,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
  title: { ...typography.subtitle, color: colors.text },
  muted: { ...typography.body, color: colors.textMuted },
  status: { ...typography.label, color: colors.plantActive },
});
