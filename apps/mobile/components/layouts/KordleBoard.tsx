import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ApiError, apiFetch } from "../../lib/api";
import type { BoardDetailResponse } from "../../lib/types";
import {
  borders,
  colors,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { AppButton, EmptyState, Pill, SurfaceCard, TextField } from "../ui";

type LetterState = "correct" | "present" | "absent";
type Feedback = Array<{ char: string; state: LetterState }>;
type PublicState = {
  puzzleId: string;
  status: "IN_PROGRESS" | "WON" | "LOST" | "ABANDONED";
  wordLength: number;
  maxGuesses: number;
  guesses: Feedback[];
  nextGuessIndex: number | null;
  solvedAtGuess: number | null;
  turn: {
    isWaiting: boolean;
    isPendingJoin: boolean;
    remainingMs: number;
  };
};
type PuzzleInfo = {
  wordLength: number;
  maxGuesses: number;
  locale: string;
  puzzle: { id: string; status: "DRAFT" | "LIVE" | "SCHEDULED" } | null;
};

export function KordleBoard({ data }: { data: BoardDetailResponse }) {
  const [puzzle, setPuzzle] = useState<PuzzleInfo | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [state, setState] = useState<PublicState | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAttempt = useCallback(async (id: string) => {
    const result = await apiFetch<{ state: PublicState }>(
      `/api/kordle/attempts/${encodeURIComponent(id)}`,
    );
    setState(result.state);
  }, []);

  const load = useCallback(async (mode: "initial" | "refresh" | "silent" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    if (mode === "initial") setLoading(true);
    try {
      const info = await apiFetch<PuzzleInfo>(
        `/api/kordle/boards/${encodeURIComponent(data.board.id)}/puzzle`,
      );
      setPuzzle(info);
      if (info.puzzle?.status === "LIVE") {
        const attempt = await apiFetch<{ attemptId: string; state: PublicState }>(
          `/api/kordle/puzzles/${encodeURIComponent(info.puzzle.id)}/attempt`,
          { method: "POST" },
        );
        setAttemptId(attempt.attemptId);
        setState(attempt.state);
      } else {
        setAttemptId(null);
        setState(null);
      }
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setPuzzle(null);
        setError(null);
      } else {
        setError("꼬들 게임을 불러오지 못했어요.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [data.board.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (attemptId) void loadAttempt(attemptId).catch(() => undefined);
      else void load("silent");
    }, 4_000);
    return () => clearInterval(timer);
  }, [attemptId, load, loadAttempt]);

  async function submitGuess() {
    if (!attemptId || !state?.nextGuessIndex || !draft.trim()) return;
    setSubmitting(true);
    try {
      const result = await apiFetch<{ state: PublicState }>(
        `/api/kordle/attempts/${encodeURIComponent(attemptId)}/guess`,
        {
          method: "POST",
          json: { guess: draft.trim(), guessIndex: state.nextGuessIndex },
        },
      );
      setState(result.state);
      setDraft("");
      setError(null);
    } catch (caught) {
      const code = caught instanceof ApiError && typeof caught.body === "object" && caught.body
        ? (caught.body as { error?: string }).error
        : null;
      setError(
        code === "wrong_length"
          ? `${state.wordLength}칸에 맞는 단어를 입력해 주세요.`
          : code === "not_in_dictionary"
            ? "사전에 있는 단어를 입력해 주세요."
            : code === "line_not_active"
              ? "선생님이 다음 줄을 열 때까지 기다려 주세요."
              : "답을 제출하지 못했어요.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const rows = useMemo(() => {
    const length = state?.wordLength ?? puzzle?.wordLength ?? 5;
    const max = state?.maxGuesses ?? puzzle?.maxGuesses ?? 6;
    return Array.from({ length: max }, (_, rowIndex) =>
      state?.guesses[rowIndex] ?? Array.from({ length }, () => null),
    );
  }, [puzzle, state]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} />}
    >
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Text style={styles.title}>꼬들</Text>
          <Text style={styles.subtitle}>정답 단어를 추리해 보세요.</Text>
        </View>
        {state ? <Pill tone={state.status === "WON" ? "submitted" : "accent"}>{statusLabel(state.status)}</Pill> : null}
      </View>

      {error ? (
        <SurfaceCard style={styles.errorCard} accessibilityRole="alert">
          <Text style={styles.errorText} selectable>{error}</Text>
          <AppButton variant="secondary" onPress={() => void load("refresh")}>다시 시도</AppButton>
        </SurfaceCard>
      ) : null}

      {!puzzle?.puzzle ? (
        <EmptyState title="준비된 문제가 없어요" description="선생님이 문제를 만들면 여기에서 시작할 수 있어요." />
      ) : puzzle.puzzle.status !== "LIVE" ? (
        <EmptyState title="게임 시작을 기다리고 있어요" description="문제가 시작되면 자동으로 입장합니다." />
      ) : state ? (
        <>
          <SurfaceCard style={styles.gridCard} accessibilityLabel="꼬들 추리판">
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                {row.map((cell, cellIndex) => (
                  <View
                    key={cellIndex}
                    style={[
                      styles.cell,
                      cell?.state === "correct" && styles.cellCorrect,
                      cell?.state === "present" && styles.cellPresent,
                      cell?.state === "absent" && styles.cellAbsent,
                    ]}
                  >
                    <Text style={[styles.cellText, cell && styles.cellTextFilled]}>
                      {cell?.char ?? ""}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </SurfaceCard>

          {state.status === "IN_PROGRESS" ? (
            <SurfaceCard style={styles.composer}>
              {state.turn.isWaiting || state.turn.isPendingJoin ? (
                <Text style={styles.waiting}>선생님이 다음 입력 차례를 열 때까지 기다려 주세요.</Text>
              ) : (
                <>
                  <TextField
                    value={draft}
                    onChangeText={setDraft}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder={`${state.wordLength}칸 단어 입력`}
                    accessibilityLabel="꼬들 추리 단어"
                    onSubmitEditing={() => void submitGuess()}
                  />
                  <AppButton
                    onPress={() => void submitGuess()}
                    loading={submitting}
                    disabled={!draft.trim()}
                  >
                    추리 제출
                  </AppButton>
                </>
              )}
            </SurfaceCard>
          ) : (
            <EmptyState
              title={state.status === "WON" ? "정답을 맞혔어요!" : "이번 문제가 끝났어요"}
              description={state.solvedAtGuess ? `${state.solvedAtGuess}번째 시도에서 완료했어요.` : "다음 문제를 기다려 주세요."}
            />
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function statusLabel(status: PublicState["status"]) {
  if (status === "WON") return "정답";
  if (status === "LOST") return "종료";
  if (status === "ABANDONED") return "중단";
  return "진행 중";
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  heading: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headingText: { flex: 1, gap: spacing.xs },
  title: { ...typography.display, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },
  gridCard: { padding: spacing.lg, gap: spacing.sm, alignItems: "center" },
  row: { flexDirection: "row", gap: spacing.sm },
  cell: {
    width: tapMin,
    height: tapMin,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  cellCorrect: { backgroundColor: colors.plantActive, borderColor: colors.plantActive },
  cellPresent: { backgroundColor: colors.warning, borderColor: colors.warning },
  cellAbsent: { backgroundColor: colors.textMuted, borderColor: colors.textMuted },
  cellText: { ...typography.title, color: colors.text },
  cellTextFilled: { color: colors.onAccent },
  composer: { padding: spacing.lg, gap: spacing.md },
  waiting: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  errorCard: { padding: spacing.md, gap: spacing.md },
  errorText: { ...typography.body, color: colors.danger, textAlign: "center" },
});
