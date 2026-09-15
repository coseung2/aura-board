import { StyleSheet, Text, View } from "react-native";
import type { SongGuessSnapshot } from "../../lib/song-guess-contract";
import { borders, radii, spacing, tapMin, typography } from "../../theme/tokens";
import { songGuessStudentTheme as song } from "../../theme/song-guess";
import { AppButton, TextField } from "../ui";

type Props = {
  snapshot: SongGuessSnapshot;
  canGuess: boolean;
  busy: boolean;
  blocked: boolean;
  guess: string;
  onGuessChange: (text: string) => void;
  onSubmit: (choiceId?: string) => void;
  /** Optimistic pick: the tapped choice highlights before the server echoes
   * it back, so a tap never looks ignored while the round is confirming. */
  pendingChoiceId?: string | null;
};

export function SongGuessAnswer({
  snapshot, canGuess, busy, blocked, guess, onGuessChange, onSubmit, pendingChoiceId = null,
}: Props) {
  if (snapshot.viewer.joined === false) return null;
  const disabled = !canGuess || busy || blocked;
  const prompt = snapshot.answerTarget === "artist"
    ? "가수·작곡가"
    : snapshot.answerTarget === "artist-title"
      ? "가수·작곡가 - 노래 제목"
      : "노래 제목";

  if (snapshot.answerMode === "multiple-choice") {
    if (!["guessing", "reveal"].includes(snapshot.phase)) return null;
    const choices = snapshot.currentRound.choices ?? [];
    const selectedId = snapshot.viewer.selectedChoiceId ?? pendingChoiceId;
    const selected = choices.find((choice) => choice.id === selectedId);
    const answered = snapshot.viewer.answeredCurrentRound || selected !== undefined;
    const revealed = snapshot.phase === "reveal";
    return (
      <View style={styles.container}>
        <View style={styles.choiceGrid}>
          {choices.map((choice, index) => {
            const isSelected = selected?.id === choice.id;
            const isCorrect = revealed && snapshot.currentRound.revealedAnswer != null &&
              normalizeAnswer(choice.label) === normalizeAnswer(snapshot.currentRound.revealedAnswer);
            const revealStyle = isCorrect ? styles.choiceCorrect : revealed && isSelected ? styles.choiceWrong : null;
            return (
              <AppButton
                key={choice.id}
                variant="secondary"
                style={[
                  styles.choice,
                  choiceStyles[index],
                  isSelected && styles.selected,
                  (answered || revealed) && !isSelected && styles.choiceMuted,
                  revealStyle,
                ]}
                disabled={disabled || answered || revealed}
                accessibilityLabel={`${choice.label}${isCorrect ? ", 정답" : revealed && isSelected ? ", 제출한 오답" : ""}`}
                accessibilityHint={revealed || answered ? undefined : "누르면 이 답을 제출합니다"}
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSubmit(choice.id)}
              >
                <Text style={[styles.choiceText, index === 2 && styles.choiceTextDark]} numberOfLines={2}>{choice.label}</Text>
              </AppButton>
            );
          })}
        </View>
      </View>
    );
  }

  if (snapshot.phase !== "guessing") return null;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>정답 입력</Text>
      <TextField
        value={guess}
        onChangeText={onGuessChange}
        placeholder={prompt}
        placeholderTextColor={song.muted}
        style={styles.textField}
        returnKeyType="send"
        editable={!disabled}
        maxLength={200}
        autoCorrect={false}
        onSubmitEditing={() => onSubmit()}
        accessibilityLabel={prompt}
      />
      <AppButton
        style={styles.submitButton}
        textStyle={styles.submitButtonText}
        loading={busy}
        disabled={disabled || !guess.trim()}
        onPress={() => onSubmit()}
      >
        {canGuess ? "제출" : "완료"}
      </AppButton>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  title: { ...typography.badge, color: song.muted },
  choiceGrid: { gap: spacing.sm },
  choice: {
    minHeight: song.answerHeight,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: borders.hairline,
    borderColor: "transparent",
    borderRadius: song.answerRadius,
  },
  choiceText: { ...typography.subtitle, flex: 1, color: song.text, textAlign: "left" },
  choiceTextDark: { color: song.answerDarkText },
  selected: { borderColor: song.text, borderWidth: song.selectedBorderWidth },
  choiceMuted: { opacity: song.mutedChoiceOpacity },
  choiceCorrect: { borderColor: song.success, borderWidth: song.selectedBorderWidth },
  choiceWrong: { borderColor: song.danger, borderWidth: song.selectedBorderWidth },
  first: { backgroundColor: song.answer1 },
  second: { backgroundColor: song.answer2 },
  third: { backgroundColor: song.answer3 },
  fourth: { backgroundColor: song.answer4 },
  textField: {
    minHeight: tapMin * 1.2,
    borderRadius: radii.control,
    borderColor: song.borderStrong,
    backgroundColor: song.surface,
    color: song.text,
  },
  submitButton: { backgroundColor: song.accent, borderColor: song.accent },
  submitButtonText: { color: song.bg },
});

const choiceStyles = [styles.first, styles.second, styles.third, styles.fourth];

function normalizeAnswer(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .toLocaleLowerCase("und")
    .trim()
    .replace(/\s+/gu, " ");
}
