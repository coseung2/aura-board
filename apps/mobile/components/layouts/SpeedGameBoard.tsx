import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { ApiError, apiFetch } from "../../lib/api";
import type { BoardDetailResponse, SpeedGameWire } from "../../lib/types";
import {
  borders,
  colors,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { AppButton, TextField } from "../ui";
import { GameExitDialog } from "../game-platform/GameExitDialog";
import { GameLobby } from "../game-platform/GameLobby";
import { GameResultPanel } from "../game-platform/GameResultPanel";

type Props = { data: BoardDetailResponse };
type ParticipantAction = "join" | "ready" | "forfeit";

type PendingCommand = {
  requestId: string;
  runId: string;
  expectedVersion: number;
  fingerprint: string;
};

function requestId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function initialSpeedGame(data: BoardDetailResponse): SpeedGameWire | null {
  const speedData = data.layoutData.speedGame as
    | { game?: SpeedGameWire | null }
    | undefined;
  return speedData?.game ?? null;
}

function commandError(caught: unknown): {
  error?: string;
  game?: SpeedGameWire;
} {
  if (!(caught instanceof ApiError) || !caught.body || typeof caught.body !== "object") {
    return {};
  }
  return caught.body as { error?: string; game?: SpeedGameWire };
}

function errorLabel(code: string | undefined) {
  switch (code) {
    case "version_conflict":
      return "다른 기기에서 상태가 바뀌어 최신 게임을 반영했어요.";
    case "not_current_guesser":
      return "이번 라운드의 답변 순서가 아니에요.";
    case "already_answered":
      return "우리 모둠은 이미 답을 제출했어요.";
    case "participant_not_invited":
      return "이 게임의 참가자 명단에 없어요.";
    case "participant_forfeited":
      return "이미 게임에서 나간 참가자예요.";
    default:
      return "요청을 처리하지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
  }
}

export function SpeedGameBoard({ data }: Props) {
  const router = useRouter();
  const [game, setGame] = useState<SpeedGameWire | null>(() => initialSpeedGame(data));
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exitVisible, setExitVisible] = useState(false);
  const participantRef = useRef<PendingCommand | null>(null);
  const answerRef = useRef<PendingCommand | null>(null);
  const joinedRunRef = useRef<string | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  const load = useCallback(async () => {
    const current = gameRef.current;
    if (!current) return;
    try {
      const response = await apiFetch<{ game: SpeedGameWire }>(
        `/api/speed-game/games/${encodeURIComponent(current.id)}`,
      );
      setGame(response.game);
      if (
        participantRef.current &&
        response.game.version !== participantRef.current.expectedVersion
      ) {
        participantRef.current = null;
      }
      if (
        answerRef.current &&
        response.game.version !== answerRef.current.expectedVersion
      ) {
        answerRef.current = null;
      }
    } catch {
      // Polling is best effort; mutations still surface actionable failures.
    }
  }, []);

  useEffect(() => {
    setGame(initialSpeedGame(data));
    setDraft("");
    setError(null);
    setExitVisible(false);
    participantRef.current = null;
    answerRef.current = null;
    joinedRunRef.current = null;
  }, [data]);

  useEffect(() => {
    if (!game?.id) return;
    const timer = setInterval(() => {
      void load();
    }, 2_500);
    return () => clearInterval(timer);
  }, [game?.id, load]);

  const participant = useMemo(() => {
    if (!game) return null;
    return (
      game.participants.find(
        (candidate) => candidate.studentId === data.currentStudent.id,
      ) ?? null
    );
  }, [data.currentStudent.id, game]);

  const group = useMemo(() => {
    if (!game || !participant) return null;
    return game.groups.find((candidate) => candidate.id === participant.groupId) ?? null;
  }, [game, participant]);

  const round = useMemo(() => {
    if (!game || game.roundIndex < 0) return null;
    return game.rounds.find((candidate) => candidate.order === game.roundIndex) ?? null;
  }, [game]);

  const existingAnswer = useMemo(() => {
    if (!game || !round || !group) return null;
    return (
      game.answers.find(
        (candidate) =>
          candidate.roundId === round.id && candidate.groupId === group.id,
      ) ?? null
    );
  }, [game, group, round]);

  const canAnswer = useMemo(() => {
    if (
      !game ||
      !participant ||
      !group ||
      !round ||
      participant.forfeitedAt ||
      game.status !== "active" ||
      existingAnswer
    ) {
      return false;
    }
    const memberIndex = group.studentIds.indexOf(participant.studentId);
    return memberIndex >= 0 && memberIndex + 1 === round.guesserSlot;
  }, [existingAnswer, game, group, participant, round]);

  const participantCommand = useCallback(
    async (action: ParticipantAction) => {
      if (!game) return null;
      const fingerprint = `${action}:${game.runId}`;
      const pending = participantRef.current;
      const command =
        pending &&
        pending.runId === game.runId &&
        pending.expectedVersion === game.version &&
        pending.fingerprint === fingerprint
          ? pending
          : {
              requestId: requestId(`speed_${action}`),
              runId: game.runId,
              expectedVersion: game.version,
              fingerprint,
            };
      participantRef.current = command;
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch<{
          game: SpeedGameWire;
          resultId: string | null;
        }>(`/api/speed-game/games/${encodeURIComponent(game.id)}/participant`, {
          method: "POST",
          json: {
            requestId: command.requestId,
            runId: command.runId,
            expectedVersion: command.expectedVersion,
            action,
          },
        });
        participantRef.current = null;
        setGame(response.game);
        return response;
      } catch (caught) {
        const body = commandError(caught);
        if (body.game) {
          setGame(body.game);
          if (body.game.version !== command.expectedVersion) {
            participantRef.current = null;
          }
        }
        setError(errorLabel(body.error));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [game],
  );

  useEffect(() => {
    if (
      !game ||
      !participant ||
      participant.joinedAt ||
      participant.forfeitedAt ||
      joinedRunRef.current === game.runId
    ) {
      return;
    }
    joinedRunRef.current = game.runId;
    void participantCommand("join").then((result) => {
      if (!result) joinedRunRef.current = null;
    });
  }, [game, participant, participantCommand]);

  const submit = useCallback(async () => {
    if (!game || !round || !group || !canAnswer) return;
    const answer = draft.trim();
    if (!answer) return;
    const fingerprint = `${game.runId}:${round.id}:${group.id}:${answer}`;
    const pending = answerRef.current;
    const command =
      pending &&
      pending.runId === game.runId &&
      pending.expectedVersion === game.version &&
      pending.fingerprint === fingerprint
        ? pending
        : {
            requestId: requestId("speed_answer"),
            runId: game.runId,
            expectedVersion: game.version,
            fingerprint,
          };
    answerRef.current = command;
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<{ game: SpeedGameWire }>(
        `/api/speed-game/games/${encodeURIComponent(game.id)}/answer`,
        {
          method: "POST",
          json: {
            requestId: command.requestId,
            runId: command.runId,
            expectedVersion: command.expectedVersion,
            answer,
            roundId: round.id,
            groupId: group.id,
          },
        },
      );
      answerRef.current = null;
      setGame(response.game);
      setDraft("");
    } catch (caught) {
      const body = commandError(caught);
      if (body.game) {
        setGame(body.game);
        if (body.game.version !== command.expectedVersion) {
          answerRef.current = null;
        }
      }
      setError(errorLabel(body.error));
    } finally {
      setLoading(false);
    }
  }, [canAnswer, draft, game, group, round]);

  if (!game) {
    return (
      <View style={styles.stateBox}>
        <Text selectable style={styles.title}>스피드게임 준비 중</Text>
        <Text selectable style={styles.muted}>
          게임 설정이나 모둠 구성이 아직 완료되지 않았어요.
        </Text>
      </View>
    );
  }

  if (game.status === "waiting") {
    return (
      <GameLobby
        title="스피드게임 대기실"
        description="내 모둠을 확인하고 준비가 끝나면 준비하기를 눌러 주세요."
        participants={game.participants.map((candidate) => ({
          id: candidate.studentId,
          name: candidate.name,
          state: candidate.forfeitedAt
            ? "forfeited"
            : candidate.readyAt
              ? "ready"
              : candidate.joinedAt
                ? "joined"
                : "invited",
        }))}
        error={error}
        actions={
          participant ? (
            <ActionButton
              label={participant.readyAt ? "준비 완료" : "준비하기"}
              disabled={loading || Boolean(participant.readyAt)}
              onPress={() => void participantCommand("ready")}
            />
          ) : null
        }
      />
    );
  }

  if (game.status === "finished") {
    const ownScore = group
      ? game.leaderboard.find((candidate) => candidate.groupId === group.id)
      : null;
    const ownRank = ownScore
      ? game.leaderboard.findIndex((candidate) => candidate.groupId === ownScore.groupId) + 1
      : null;
    return (
      <GameResultPanel
        outcome={
          game.terminalReason === "host_ended"
            ? "host-ended"
            : participant?.forfeitedAt
              ? "forfeit"
              : "completed"
        }
        score={ownScore?.score ?? null}
        metrics={
          ownRank == null
            ? [{ label: "라운드", value: `${game.rounds.length}개` }]
            : [
                { label: "모둠 순위", value: `${ownRank}위` },
                { label: "라운드", value: `${game.rounds.length}개` },
              ]
        }
        message="서버가 확정한 결과가 나의 전적에 기록됩니다."
        actions={
          <View style={styles.actions}>
            <ActionButton label="게임 목록" onPress={() => router.back()} />
          </View>
        }
      />
    );
  }

  return (
    <View style={styles.root} accessibilityState={{ busy: loading }}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text selectable style={styles.eyebrow}>ROUND</Text>
          <Text selectable style={styles.title}>
            {round ? `${round.order + 1}/${game.rounds.length} 라운드` : "라운드 준비 중"}
          </Text>
          <Text selectable style={styles.muted}>
            {group ? `${group.name} · ${round?.guesserSlot ?? "-"}번 순서` : "배정된 모둠 없음"}
          </Text>
        </View>
        <AppButton
          disabled={loading || Boolean(participant?.forfeitedAt)}
          onPress={() => setExitVisible(true)}
          style={styles.dangerButton}
          textStyle={styles.dangerText}
          variant="quiet"
        >
          게임 나가기
        </AppButton>
      </View>

      {loading ? <ActivityIndicator color={colors.accent} /> : null}
      {error ? (
        <Text selectable style={styles.error} accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}

      <View style={styles.promptCard}>
        <Text selectable style={styles.promptLabel}>현재 순서</Text>
        <Text selectable style={styles.promptValue}>
          {round ? `${round.guesserSlot}번` : "—"}
        </Text>
      </View>

      <View style={styles.answerPanel}>
        {existingAnswer ? (
          <Text selectable style={styles.statusText}>
            제출 완료: {existingAnswer.answer || "답변 비공개"}
            {existingAnswer.correct === null
              ? " · 교사 확인 중"
              : existingAnswer.correct
                ? ` · 정답 +${existingAnswer.score ?? 0}점`
                : " · 오답"}
          </Text>
        ) : (
          <>
            <Text selectable style={styles.label}>답변</Text>
            <TextField
              value={draft}
              editable={canAnswer && !loading}
              onChangeText={setDraft}
              maxLength={200}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={canAnswer ? "답을 입력하세요" : "내 순서를 기다려 주세요"}
              style={styles.input}
            />
            <ActionButton
              label="정답 제출"
              disabled={!canAnswer || loading || !draft.trim()}
              onPress={() => void submit()}
            />
          </>
        )}
      </View>

      <View style={styles.leaderboard}>
        <Text selectable style={styles.subtitle}>모둠 점수</Text>
        {game.leaderboard.map((row, index) => (
          <View style={styles.scoreRow} key={row.groupId}>
            <Text selectable style={styles.scoreName}>
              {index + 1}. {row.groupName}
            </Text>
            <Text selectable style={[styles.scoreValue, styles.tabular]}>
              {row.score.toLocaleString("ko-KR")}점
            </Text>
          </View>
        ))}
      </View>

      <Text selectable style={styles.runtimeMeta}>
        run {game.runId} · v{game.version}
      </Text>

      <GameExitDialog
        visible={exitVisible}
        title="스피드게임에서 나갈까요?"
        description="진행 중 나가면 이번 run은 기권으로 기록됩니다. 서버가 종료 결과를 확정한 뒤 나갈 수 있어요."
        confirmLabel="기권하고 나가기"
        busy={loading}
        onCancel={() => setExitVisible(false)}
        onConfirm={async () => {
          const result = await participantCommand("forfeit");
          if (result) setExitVisible(false);
        }}
      />
    </View>
  );
}

function ActionButton({
  label,
  disabled = false,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <AppButton
      disabled={disabled}
      onPress={onPress}
      style={styles.actionButton}
    >
      {label}
    </AppButton>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  stateBox: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerText: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.micro, color: colors.textMuted },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.subtitle, color: colors.text },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
  dangerButton: {
    minHeight: tapMin,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.dangerTintedBg,
  },
  dangerText: { ...typography.label, color: colors.danger },
  promptCard: {
    gap: spacing.xs,
    alignItems: "center",
    padding: spacing.lg,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
  },
  promptLabel: { ...typography.micro, color: colors.textMuted },
  promptValue: { ...typography.display, color: colors.text },
  answerPanel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
  },
  label: { ...typography.label, color: colors.text },
  input: {
    minHeight: tapMin,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  statusText: { ...typography.body, color: colors.text },
  leaderboard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
  },
  scoreRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.bg,
  },
  scoreName: { ...typography.label, color: colors.text, flexShrink: 1 },
  scoreValue: { ...typography.label, color: colors.text },
  actionButton: {
    minHeight: tapMin,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radii.control,
    borderCurve: "continuous",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  runtimeMeta: { ...typography.micro, color: colors.textFaint },
  tabular: { fontVariant: ["tabular-nums"] },
});
