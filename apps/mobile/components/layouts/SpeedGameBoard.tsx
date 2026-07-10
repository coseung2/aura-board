import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "../../lib/api";
import type { BoardDetailResponse, SpeedGameWire } from "../../lib/types";
import { colors, spacing, typography } from "../../theme/tokens";
import { AppButton, EmptyState, Pill, SurfaceCard, TextField } from "../ui";

export function SpeedGameBoard({ data }: { data: BoardDetailResponse }) {
  const [game, setGame] = useState<SpeedGameWire | null>(data.layoutData.speedGame?.game ?? null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    setGame(data.layoutData.speedGame?.game ?? null);
  }, [data.layoutData.speedGame?.game]);

  useEffect(() => {
    if (!game?.id) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const result = await apiFetch<{ game: SpeedGameWire }>(
          `/api/speed-game/games/${encodeURIComponent(game.id)}`,
        );
        if (!cancelled) setGame(result.game);
      } catch {
        if (!cancelled) setError("게임 상태를 갱신하지 못했어요.");
      }
    };
    const timer = setInterval(() => void refresh(), 2_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [game?.id]);

  const round = game && game.roundIndex >= 0 ? game.rounds[game.roundIndex] ?? null : null;
  const group = useMemo(
    () => game?.groups.find((candidate) => candidate.studentIds.includes(data.currentStudent.id)) ?? null,
    [data.currentStudent.id, game],
  );
  const slot = group ? group.studentIds.indexOf(data.currentStudent.id) + 1 : 0;
  const myTurn = Boolean(round && slot === round.guesserSlot);
  const answer = game && round && group
    ? game.answers.find((candidate) => candidate.roundId === round.id && candidate.groupId === group.id) ?? null
    : null;

  useEffect(() => {
    startedAt.current = Date.now();
    setDraft("");
  }, [round?.id]);

  async function submit() {
    if (!game || !round || !group || !draft.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/speed-game/games/${encodeURIComponent(game.id)}/answer`, {
        method: "POST",
        json: {
          roundId: round.id,
          groupId: group.id,
          answer: draft.trim(),
          elapsedMs: Math.max(0, Date.now() - startedAt.current),
        },
      });
      const refreshed = await apiFetch<{ game: SpeedGameWire }>(
        `/api/speed-game/games/${encodeURIComponent(game.id)}`,
      );
      setGame(refreshed.game);
      setDraft("");
      setError(null);
    } catch {
      setError("답을 제출하지 못했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!game) {
    return <View style={styles.center}><EmptyState title="준비된 스피드게임이 없어요" /></View>;
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Text style={styles.title}>스피드게임</Text>
          <Text style={styles.subtitle}>{group ? `${group.name} · ${slot}번 주자` : "모둠 배정을 기다리는 중"}</Text>
        </View>
        <Pill tone={game.status === "finished" ? "neutral" : "accent"}>
          {game.status === "waiting" ? "대기 중" : game.status === "active" ? "진행 중" : "종료"}
        </Pill>
      </View>

      {error ? <Text style={styles.error} accessibilityRole="alert" selectable>{error}</Text> : null}

      {game.status === "waiting" ? (
        <EmptyState title="선생님이 게임을 시작하면 문제가 열려요" />
      ) : game.status === "finished" ? (
        <Leaderboard game={game} />
      ) : round ? (
        <>
          <SurfaceCard style={styles.roundCard}>
            <Text style={styles.roundLabel}>ROUND {game.roundIndex + 1} / {game.rounds.length}</Text>
            {myTurn ? (
              <>
                <Text style={styles.command}>설명을 듣고 정답을 입력하세요</Text>
                <TextField
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="정답"
                  accessibilityLabel="스피드게임 정답"
                  onSubmitEditing={() => void submit()}
                />
                <AppButton onPress={() => void submit()} loading={submitting} disabled={!draft.trim()}>
                  정답 제출
                </AppButton>
              </>
            ) : (
              <Text style={styles.command}>{round.guesserSlot}번 주자가 답하는 중이에요.</Text>
            )}
            {!myTurn && round.keyword ? (
              <View style={styles.keywordCard} accessibilityRole="summary">
                <Text style={styles.keywordLabel}>설명할 단어</Text>
                <Text style={styles.keyword}>{round.keyword}</Text>
              </View>
            ) : null}
            {answer ? (
              <Pill tone={answer.correct ? "submitted" : answer.correct === false ? "danger" : "warning"}>
                {answer.correct ? `정답 +${answer.score ?? 0}점` : answer.correct === false ? "다시 생각해 보세요" : "판정 대기"}
              </Pill>
            ) : null}
          </SurfaceCard>
          <Leaderboard game={game} />
        </>
      ) : (
        <EmptyState title="다음 라운드를 기다리는 중이에요" />
      )}
    </ScrollView>
  );
}

function Leaderboard({ game }: { game: SpeedGameWire }) {
  return (
    <SurfaceCard style={styles.leaderboard}>
      <Text style={styles.sectionTitle}>현재 순위</Text>
      {game.leaderboard.map((entry, index) => (
        <View key={entry.groupId} style={styles.rankRow}>
          <Text style={styles.rank}>{index + 1}</Text>
          <Text style={styles.groupName}>{entry.groupName}</Text>
          <Text style={styles.score}>{entry.score.toLocaleString()}점</Text>
        </View>
      ))}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  heading: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headingText: { flex: 1, gap: spacing.xs },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
  roundCard: { padding: spacing.xl, gap: spacing.lg, alignItems: "stretch" },
  roundLabel: { ...typography.badge, color: colors.accent, textAlign: "center" },
  command: { ...typography.title, color: colors.text, textAlign: "center" },
  keywordCard: {
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.lg,
    backgroundColor: colors.accentTintedBg,
  },
  keywordLabel: { ...typography.badge, color: colors.accent },
  keyword: { ...typography.display, color: colors.text, textAlign: "center" },
  leaderboard: { padding: spacing.lg, gap: spacing.sm },
  sectionTitle: { ...typography.section, color: colors.text },
  rankRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  rank: { ...typography.section, color: colors.accent },
  groupName: { ...typography.body, color: colors.text, flex: 1 },
  score: { ...typography.label, color: colors.text, fontVariant: ["tabular-nums"] },
});
