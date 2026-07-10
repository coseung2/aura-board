import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiFetch } from "../../lib/api";
import type { BoardDetailResponse } from "../../lib/types";
import {
  assignment,
  colors,
  spacing,
  typography,
} from "../../theme/tokens";
import {
  AppButton,
  ControlPressable,
  EmptyState,
  Pill,
  SurfaceCard,
  TextField,
} from "../ui";

type Choice = { id: string; text: string };
type Question = {
  id: string;
  order: number;
  kind: "MCQ" | "SHORT" | "MANUAL";
  prompt: string;
  maxScore: number;
  choices?: Choice[];
};
type Template = {
  id: string;
  title: string;
  durationMin: number;
  questions: Question[];
};
type Submission = {
  id: string;
  status: "in_progress" | "submitted";
  startedAt: string;
  endAt: string;
};

type ReadyState = {
  template: Template;
  submission: Submission;
  clockSkewMs: number;
};

export function AssessmentBoard({ data }: { data: BoardDetailResponse }) {
  const [state, setState] = useState<"loading" | "empty" | "submitted" | ReadyState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const bootstrap = await apiFetch<{
        templateId: string | null;
        submitted: boolean;
      }>(`/api/assessment/boards/${encodeURIComponent(data.board.id)}`);
      if (!bootstrap.templateId) {
        setState("empty");
        return;
      }
      if (bootstrap.submitted) {
        setState("submitted");
        return;
      }
      const templateResult = await apiFetch<{ template: Template; viewer: string }>(
        `/api/assessment/templates/${encodeURIComponent(bootstrap.templateId)}`,
      );
      if (templateResult.viewer !== "student") throw new Error("forbidden");
      const submissionResult = await apiFetch<{
        submission: Submission;
        serverTime: string;
      }>(
        `/api/assessment/templates/${encodeURIComponent(bootstrap.templateId)}/submissions`,
        { method: "POST" },
      );
      if (submissionResult.submission.status === "submitted") {
        setState("submitted");
        return;
      }
      setState({
        template: templateResult.template,
        submission: submissionResult.submission,
        clockSkewMs: Date.now() - new Date(submissionResult.serverTime).getTime(),
      });
    } catch {
      setError("수행평가를 불러오지 못했어요.");
    }
  }, [data.board.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const ready = typeof state === "object" ? state : null;
  const remainingSec = useMemo(() => {
    if (!ready) return 0;
    const end = new Date(ready.submission.endAt).getTime() + ready.clockSkewMs;
    return Math.max(0, Math.floor((end - now) / 1_000));
  }, [now, ready]);

  async function saveAnswer(question: Question, nextChoices?: string[], nextText?: string) {
    if (!ready || remainingSec === 0) return;
    setSavingId(question.id);
    try {
      await apiFetch(
        `/api/assessment/submissions/${encodeURIComponent(ready.submission.id)}/answer`,
        {
          method: "PATCH",
          json: question.kind === "MCQ"
            ? { questionId: question.id, selectedChoiceIds: nextChoices ?? [] }
            : { questionId: question.id, textAnswer: nextText ?? "" },
        },
      );
      setError(null);
    } catch {
      setError(`${question.order + 1}번 답안을 저장하지 못했어요.`);
    } finally {
      setSavingId(null);
    }
  }

  function toggleChoice(question: Question, choiceId: string) {
    const current = choices[question.id] ?? [];
    const next = current.includes(choiceId)
      ? current.filter((id) => id !== choiceId)
      : [...current, choiceId];
    setChoices((previous) => ({ ...previous, [question.id]: next }));
    void saveAnswer(question, next);
  }

  function confirmSubmit() {
    if (!ready || submitting) return;
    Alert.alert("수행평가 제출", "제출하면 답안을 수정할 수 없어요.", [
      { text: "취소", style: "cancel" },
      { text: "제출", style: "destructive", onPress: () => void submit() },
    ]);
  }

  async function submit() {
    if (!ready) return;
    setSubmitting(true);
    try {
      await apiFetch(
        `/api/assessment/submissions/${encodeURIComponent(ready.submission.id)}/submit`,
        { method: "POST" },
      );
      setState("submitted");
      setError(null);
    } catch {
      setError("제출하지 못했어요. 저장 상태를 확인하고 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "loading") {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }
  if (error && !ready) {
    return (
      <View style={styles.center} accessibilityRole="alert">
        <Text style={styles.errorText} selectable>{error}</Text>
        <AppButton variant="secondary" onPress={() => void load()}>다시 시도</AppButton>
      </View>
    );
  }
  if (state === "empty") {
    return <View style={styles.center}><EmptyState title="아직 배부된 평가가 없어요" /></View>;
  }
  if (state === "submitted") {
    return (
      <View style={styles.center}>
        <EmptyState title="제출 완료" description="선생님의 채점과 결과 공개를 기다려 주세요." />
      </View>
    );
  }
  if (!ready) return null;

  const answered = ready.template.questions.filter((question) =>
    question.kind === "MCQ"
      ? (choices[question.id]?.length ?? 0) > 0
      : Boolean(texts[question.id]?.trim()),
  ).length;
  const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const ss = String(remainingSec % 60).padStart(2, "0");

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <SurfaceCard style={styles.statusCard}>
        <View style={styles.statusTop}>
          <View style={styles.titleWrap}>
            <Text style={styles.title} selectable>{ready.template.title}</Text>
            <Text style={styles.progress}>답변 {answered}/{ready.template.questions.length}</Text>
          </View>
          <Pill tone={remainingSec < 300 ? "danger" : "accent"}>{mm}:{ss}</Pill>
        </View>
        {remainingSec === 0 ? <Text style={styles.errorText}>응시 시간이 끝났어요.</Text> : null}
      </SurfaceCard>

      {error ? <Text style={styles.errorText} accessibilityRole="alert" selectable>{error}</Text> : null}

      {ready.template.questions.map((question) => (
        <SurfaceCard key={question.id} style={styles.questionCard}>
          <View style={styles.questionHeader}>
            <Text style={styles.questionNumber}>{question.order + 1}</Text>
            <Text style={styles.questionPrompt} selectable>{question.prompt}</Text>
            <Text style={styles.score}>{question.maxScore}점</Text>
          </View>
          {question.kind === "MCQ" ? (
            <View style={styles.choiceList}>
              {(question.choices ?? []).map((choice) => {
                const selected = choices[question.id]?.includes(choice.id) ?? false;
                return (
                  <ControlPressable
                    key={choice.id}
                    onPress={() => toggleChoice(question, choice.id)}
                    disabled={remainingSec === 0 || savingId === question.id}
                    accessibilityState={{ selected, disabled: remainingSec === 0 }}
                    style={[styles.choice, selected && styles.choiceSelected]}
                  >
                    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]} selectable>
                      {choice.text}
                    </Text>
                  </ControlPressable>
                );
              })}
            </View>
          ) : (
            <TextField
              value={texts[question.id] ?? ""}
              onChangeText={(value) =>
                setTexts((previous) => ({
                  ...previous,
                  [question.id]: question.kind === "SHORT"
                    ? value.replace(/\s+/g, "")
                    : value.slice(0, 500),
                }))
              }
              onBlur={() => void saveAnswer(question, undefined, texts[question.id] ?? "")}
              editable={remainingSec > 0}
              multiline={question.kind === "MANUAL"}
              maxLength={question.kind === "MANUAL" ? 500 : 100}
              placeholder={question.kind === "MANUAL" ? "답안을 작성하세요" : "정답 입력"}
              accessibilityLabel={`${question.order + 1}번 답안`}
              style={question.kind === "MANUAL" ? styles.manualInput : undefined}
            />
          )}
          {savingId === question.id ? <Text style={styles.saving}>저장 중...</Text> : null}
        </SurfaceCard>
      ))}

      <AppButton
        onPress={confirmSubmit}
        loading={submitting}
        disabled={remainingSec === 0}
        accessibilityLabel="수행평가 최종 제출"
      >
        최종 제출
      </AppButton>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xxl },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  statusCard: { padding: spacing.lg, gap: spacing.sm },
  statusTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  titleWrap: { flex: 1, gap: spacing.xs },
  title: { ...typography.title, color: colors.text },
  progress: { ...typography.badge, color: colors.textMuted },
  questionCard: { padding: spacing.lg, gap: spacing.md },
  questionHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  questionNumber: { ...typography.section, color: colors.accent },
  questionPrompt: { ...typography.body, color: colors.text, flex: 1 },
  score: { ...typography.badge, color: colors.textMuted },
  choiceList: { gap: spacing.sm },
  choice: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, justifyContent: "center" },
  choiceSelected: { backgroundColor: colors.accentTintedBg, borderColor: colors.accent },
  choiceText: { ...typography.body, color: colors.text },
  choiceTextSelected: { color: colors.accentTintedText, fontWeight: "700" },
  manualInput: { minHeight: assignment.contentInputMinHeight, textAlignVertical: "top" },
  saving: { ...typography.micro, color: colors.textMuted, textAlign: "right" },
  errorText: { ...typography.body, color: colors.danger, textAlign: "center" },
});
