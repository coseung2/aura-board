import { StyleSheet, Text, View } from "react-native";
import type { SongGuessSnapshot } from "../../lib/song-guess-contract";
import { borders, colors, spacing, tapMin, typography } from "../../theme/tokens";
import { AppButton, TextField } from "../ui";

type Props = {
  snapshot: SongGuessSnapshot;
  canGuess: boolean;
  busy: boolean;
  blocked: boolean;
  guess: string;
  onGuessChange: (text: string) => void;
  onSubmit: (choiceId?: string) => void;
};

export function SongGuessAnswer({
  snapshot, canGuess, busy, blocked, guess, onGuessChange, onSubmit,
}: Props) {
  if (snapshot.viewer.joined === false) return null;
  const disabled = !canGuess || busy || blocked;
  const prompt = snapshot.answerTarget === "artist" ? "가수·작곡가" : snapshot.answerTarget === "artist-title" ? "가수·작곡가 - 노래 제목" : "노래 제목";
  if (snapshot.answerMode === "multiple-choice") {
    if (!["guessing", "reveal", "finished"].includes(snapshot.phase)) return null;
    const choices = snapshot.currentRound.choices ?? [];
    const selected = choices.find((choice) => choice.id === snapshot.viewer.selectedChoiceId);
    const answered = snapshot.viewer.answeredCurrentRound || selected !== undefined;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{prompt} · 정답을 하나 골라 주세요</Text>
        {choices.map((choice, index) => (
          <AppButton
            key={choice.id}
            variant="secondary"
            style={[styles.choice, choiceStyles[index], selected?.id === choice.id && styles.selected]}
            textStyle={styles.choiceText}
            disabled={disabled || answered}
            accessibilityLabel={`${index + 1}번, ${choice.label}${selected?.id === choice.id ? ", 제출한 답" : ""}`}
            accessibilityHint="누르면 이 답을 제출합니다"
            accessibilityState={{ selected: selected?.id === choice.id }}
            onPress={() => onSubmit(choice.id)}
          >
            {`${index + 1}. ${choice.label}${selected?.id === choice.id ? "  ✓ 제출한 답" : ""}`}
          </AppButton>
        ))}
        {answered ? (
          <Text style={styles.title} accessibilityLiveRegion="polite">
            {selected ? `제출한 답: ${selected.label}` : "답을 제출했어요."}
          </Text>
        ) : null}
      </View>
    );
  }
  if (snapshot.phase !== "guessing") return null;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{prompt} 맞히기</Text>
      <TextField
        value={guess}
        onChangeText={onGuessChange}
        placeholder={prompt}
        returnKeyType="send"
        editable={!disabled}
        maxLength={200}
        autoCorrect={false}
        onSubmitEditing={() => onSubmit()}
        accessibilityLabel={prompt}
      />
      <AppButton loading={busy} disabled={disabled || !guess.trim()} onPress={() => onSubmit()}>
        {canGuess ? "제출" : "완료"}
      </AppButton>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  title: { ...typography.subtitle, color: colors.text },
  choice: { minHeight: tapMin * 1.5, borderWidth: borders.medium, borderColor: colors.transparent },
  choiceText: { ...typography.subtitle, color: colors.text },
  selected: { borderColor: colors.text },
  first: { backgroundColor: colors.noticeErrorBg },
  second: { backgroundColor: colors.accentTintedBg },
  third: { backgroundColor: colors.warningTintedBg },
  fourth: { backgroundColor: colors.noticeSuccessBg },
});
const choiceStyles = [styles.first, styles.second, styles.third, styles.fourth];
