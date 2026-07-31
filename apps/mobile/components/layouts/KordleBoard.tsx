import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { ApiError, apiFetch } from "../../lib/api";
import type { BoardDetailResponse } from "../../lib/types";
import { useLiveSnapshot } from "../../lib/use-live-snapshot";
import {
  borders,
  colors,
  radii,
  spacing,
  tapMin,
  typography,
  pageChrome,
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

const KORDLE_GUESS_SUBMITTED_EVENT = "guess-submitted";
const KORDLE_PUZZLE_CHANGED_EVENT = "puzzle-changed";

export function KordleBoard({ data }: { data: BoardDetailResponse }) {
  const { width: viewportWidth } = useWindowDimensions();
  const [puzzle, setPuzzle] = useState<PuzzleInfo | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [state, setState] = useState<PublicState | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const attemptRef = useRef<string | null>(null);
  const puzzleRef = useRef<string | null>(null);
  const loadInFlightRef = useRef<Promise<void> | null>(null);
  const loadControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadControllerRef.current?.abort();
    };
  }, []);

  const load = useCallback((mode: "initial" | "refresh" | "silent" = "initial"): Promise<void> => {
    if (loadInFlightRef.current) return loadInFlightRef.current;
    if (mode === "refresh") setRefreshing(true);
    if (mode === "initial") setLoading(true);
    const controller = new AbortController();
    loadControllerRef.current = controller;
    const previousAttemptId = attemptRef.current;
    const previousPuzzleId = puzzleRef.current;
    let request!: Promise<void>;
    request = (async () => {
      try {
        const info = await apiFetch<PuzzleInfo>(
          `/api/kordle/boards/${encodeURIComponent(data.board.id)}/puzzle`,
          { signal: controller.signal },
        );
        if (!mountedRef.current || controller.signal.aborted) return;

        if (!info.puzzle || info.puzzle.status !== "LIVE") {
          setPuzzle(info);
          setAttemptId(null);
          setState(null);
          setDraft("");
          attemptRef.current = null;
          puzzleRef.current = null;
          setError(null);
          return;
        }

        const samePuzzle =
          previousAttemptId !== null && previousPuzzleId === info.puzzle.id;
        const result = samePuzzle
          ? {
              attemptId: previousAttemptId,
              state: (
                await apiFetch<{ state: PublicState }>(
                  `/api/kordle/attempts/${encodeURIComponent(previousAttemptId)}`,
                  { signal: controller.signal },
                )
              ).state,
            }
          : await apiFetch<{ attemptId: string; state: PublicState }>(
              `/api/kordle/puzzles/${encodeURIComponent(info.puzzle.id)}/attempt`,
              { method: "POST", signal: controller.signal },
            );
        if (!mountedRef.current || controller.signal.aborted) return;

        setPuzzle(info);
        setAttemptId(result.attemptId);
        setState(result.state);
        attemptRef.current = result.attemptId;
        puzzleRef.current = info.puzzle.id;
        if (!samePuzzle || previousAttemptId !== result.attemptId) setDraft("");
        setError(null);
      } catch (caught) {
        if (!mountedRef.current || controller.signal.aborted) return;
        if (caught instanceof ApiError && caught.status === 404) {
          setPuzzle(null);
          setAttemptId(null);
          setState(null);
          setDraft("");
          attemptRef.current = null;
          puzzleRef.current = null;
          setError(null);
          return;
        }
        setError("꼬들 게임을 불러오지 못했어요.");
        throw caught;
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
        if (loadControllerRef.current === controller) loadControllerRef.current = null;
        if (loadInFlightRef.current === request) loadInFlightRef.current = null;
      }
    })();
    loadInFlightRef.current = request;
    return request;
  }, [data.board.id]);

  const refresh = useCallback(async () => {
    await load("refresh").catch(() => undefined);
  }, [load]);

  useLiveSnapshot({
    channelName: `kordle:board:${data.board.id}`,
    events: [KORDLE_PUZZLE_CHANGED_EVENT, KORDLE_GUESS_SUBMITTED_EVENT],
    terminal: Boolean(state && state.status !== "IN_PROGRESS"),
    reload: () => load("silent"),
  });

  async function submitGuess() {
    if (!attemptId || state?.nextGuessIndex == null || !draft.trim()) return;
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
      if (caught instanceof ApiError && caught.status === 409) {
        await load("silent").catch(() => undefined);
      }
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
  const wordLength = state?.wordLength ?? puzzle?.wordLength ?? 5;
  const cellGap = wordLength >= 6 ? spacing.xs : spacing.sm;
  const gridHorizontalSpace = spacing.xl * 2 + spacing.lg * 2;
  const cellSize = Math.min(
    tapMin,
    Math.max(
      1,
      Math.floor(
        (viewportWidth - gridHorizontalSpace - cellGap * (wordLength - 1)) / wordLength,
      ),
    ),
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      automaticallyAdjustKeyboardInsets
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
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
              <View key={rowIndex} style={[styles.row, { gap: cellGap }]}>
                {row.map((cell, cellIndex) => (
                  <View
                    key={cellIndex}
                    accessible={Boolean(cell)}
                    accessibilityLabel={cell ? `${cell.char}, ${feedbackLabel(cell.state)}` : undefined}
                    style={[
                      styles.cell,
                      { width: cellSize, height: cellSize },
                      cell?.state === "correct" && styles.cellCorrect,
                      cell?.state === "present" && styles.cellPresent,
                      cell?.state === "absent" && styles.cellAbsent,
                    ]}
                  >
                    <Text style={[styles.cellText, cell && styles.cellTextFilled]}>
                      {cell?.char ?? ""}
                    </Text>
                    {cell ? (
                      <Text
                        style={styles.feedbackSymbol}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                      >
                        {feedbackSymbol(cell.state)}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
            <Text style={styles.feedbackLegend}>✓ 정답 위치 · ◆ 포함 · × 없음</Text>
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

function feedbackSymbol(state: LetterState) {
  if (state === "correct") return "✓";
  if (state === "present") return "◆";
  return "×";
}

function feedbackLabel(state: LetterState) {
  if (state === "correct") return "정답 위치";
  if (state === "present") return "단어에 포함";
  return "단어에 없음";
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: spacing.xl, paddingTop: pageChrome.directContentStartGap, gap: spacing.lg, paddingBottom: spacing.xxxl },
  heading: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headingText: { flex: 1, gap: spacing.xs },
  title: { ...typography.display, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },
  gridCard: { width: "100%", padding: spacing.lg, gap: spacing.sm, alignItems: "center" },
  row: { flexDirection: "row" },
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
  feedbackSymbol: {
    ...typography.badge,
    position: "absolute",
    right: spacing.xxs,
    bottom: 0,
    color: colors.onAccent,
  },
  feedbackLegend: { ...typography.label, color: colors.textMuted, textAlign: "center" },
  composer: { padding: spacing.lg, gap: spacing.md },
  waiting: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  errorCard: { padding: spacing.md, gap: spacing.md },
  errorText: { ...typography.body, color: colors.danger, textAlign: "center" },
});
