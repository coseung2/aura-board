import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { ApiError, apiFetch } from "../../lib/api";
import type {
  ShadowAllianceSnapshot,
  ShadowAllianceTeam,
} from "../../lib/shadow-alliance";
import type { BoardDetailResponse } from "../../lib/types";
import {
  borders,
  colors,
  controls,
  gamePlatform,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { AppButton, TextField } from "../ui";
import { GameAreaShell } from "../game-platform/GameAreaShell";
import { GameExitDialog } from "../game-platform/GameExitDialog";
import { GameLobby } from "../game-platform/GameLobby";
import { GameResultPanel } from "../game-platform/GameResultPanel";

type Props = { data: BoardDetailResponse };
type ParticipantAction = "join" | "ready" | "forfeit" | "submit";

type PendingCommand = {
  requestId: string;
  runId: string;
  expectedVersion: number;
  fingerprint: string;
};

function createRequestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function commandError(caught: unknown): {
  error?: string;
  snapshot?: ShadowAllianceSnapshot;
} {
  if (!(caught instanceof ApiError) || !caught.body || typeof caught.body !== "object") {
    return {};
  }
  return caught.body as {
    error?: string;
    snapshot?: ShadowAllianceSnapshot;
  };
}

function errorLabel(code: string | undefined): string {
  switch (code) {
    case "version_conflict":
      return "다른 기기에서 상태가 바뀌어 최신 게임을 반영했어요.";
    case "not_found":
      return "진행자가 게임을 준비 중이에요. 잠시 후 다시 확인해 주세요.";
    case "already_submitted":
      return "이번 라운드 숫자는 이미 제출됐어요.";
    case "participant_forfeited":
      return "이미 게임에서 나간 참가자예요.";
    case "round_expired":
      return "제출 시간이 끝났어요. 결과 공개를 기다려 주세요.";
    case "invalid_number":
      return "1부터 100 사이의 정수를 입력해 주세요.";
    case "invalid_state":
      return "현재 단계에서는 이 조작을 할 수 없어요.";
    default:
      return "요청을 처리하지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
  }
}

function participantState(
  participant: ShadowAllianceSnapshot["participants"][number],
) {
  if (participant.forfeitedAt != null) return "forfeited" as const;
  if (participant.readyAt != null) return "ready" as const;
  if (participant.joinedAt != null) return "joined" as const;
  return "invited" as const;
}

function teamLabel(team: ShadowAllianceTeam): string {
  if (team === "black") return "검정 팀";
  if (team === "white") return "흰색 팀";
  return "팀 배정 전";
}

function phaseLabel(snapshot: ShadowAllianceSnapshot): string {
  switch (snapshot.phase) {
    case "lobby":
      return "대기실";
    case "playing":
      return `${snapshot.round}/${snapshot.totalRounds} 입력`;
    case "revealing":
      return `${snapshot.round}/${snapshot.totalRounds} 결과`;
    case "postround":
      return `${snapshot.round}/${snapshot.totalRounds} 정리`;
    case "finished":
      return "완료";
    case "host-ended":
      return "진행자 종료";
  }
}

export function ShadowAllianceBoard({ data }: Props) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<ShadowAllianceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exitVisible, setExitVisible] = useState(false);
  const [numberDraft, setNumberDraft] = useState("50");
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const [clockNow, setClockNow] = useState(Date.now());
  const commandRef = useRef<PendingCommand | null>(null);
  const joinedRunRef = useRef<string | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const acceptSnapshot = useCallback((next: ShadowAllianceSnapshot) => {
    setSnapshot(next);
    const now = Date.now();
    setReceivedAt(now);
    setClockNow(now);
  }, []);

  const load = useCallback(
    async (initial = false) => {
      initial ? setLoading(true) : setReconnecting(true);
      try {
        const response = await apiFetch<{ snapshot: ShadowAllianceSnapshot }>(
          `/api/shadow-alliance/boards/${encodeURIComponent(data.board.id)}`,
        );
        acceptSnapshot(response.snapshot);
        setError(null);
        if (
          commandRef.current &&
          response.snapshot.version !== commandRef.current.expectedVersion
        ) {
          commandRef.current = null;
        }
        return response.snapshot;
      } catch (caught) {
        if (initial) setError(errorLabel(commandError(caught).error));
        return null;
      } finally {
        setLoading(false);
        setReconnecting(false);
      }
    },
    [acceptSnapshot, data.board.id],
  );

  useEffect(() => {
    setSnapshot(null);
    setError(null);
    setExitVisible(false);
    commandRef.current = null;
    joinedRunRef.current = null;
    void load(true);
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => void load(false), 2_500);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (snapshot?.phase !== "playing" || !snapshot.timerRunning) return;
    const timer = setInterval(() => setClockNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [snapshot?.phase, snapshot?.timerRunning]);

  const ownParticipant = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.participants.find((participant) => participant.isSelf) ?? null;
  }, [snapshot]);

  const command = useCallback(
    async (action: ParticipantAction, number?: number) => {
      const current = snapshotRef.current;
      if (!current) return null;
      const fingerprint = JSON.stringify({
        action,
        number: number ?? null,
        phase: current.phase,
        round: current.round,
      });
      const pending = commandRef.current;
      const envelope =
        pending &&
        pending.runId === current.id &&
        pending.expectedVersion === current.version &&
        pending.fingerprint === fingerprint
          ? pending
          : {
              requestId: createRequestId(`shadow_${action}`),
              runId: current.id,
              expectedVersion: current.version,
              fingerprint,
            };
      commandRef.current = envelope;
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch<{ snapshot: ShadowAllianceSnapshot }>(
          `/api/shadow-alliance/boards/${encodeURIComponent(data.board.id)}`,
          {
            method: "PATCH",
            json: {
              requestId: envelope.requestId,
              runId: envelope.runId,
              expectedVersion: envelope.expectedVersion,
              action,
              ...(number === undefined ? {} : { number }),
            },
          },
        );
        commandRef.current = null;
        acceptSnapshot(response.snapshot);
        return response.snapshot;
      } catch (caught) {
        const body = commandError(caught);
        if (body.snapshot) {
          acceptSnapshot(body.snapshot);
          if (body.snapshot.version !== envelope.expectedVersion) {
            commandRef.current = null;
          }
        }
        setError(errorLabel(body.error));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [acceptSnapshot, data.board.id],
  );

  useEffect(() => {
    if (
      !snapshot ||
      !ownParticipant ||
      ownParticipant.joinedAt != null ||
      joinedRunRef.current === snapshot.id
    ) {
      return;
    }
    joinedRunRef.current = snapshot.id;
    void command("join").then((next) => {
      if (!next) joinedRunRef.current = null;
    });
  }, [command, ownParticipant, snapshot]);

  const rankedParticipants = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.participants]
      .filter((participant) => participant.joinedAt != null)
      .sort(
        (left, right) =>
          right.power - left.power ||
          left.name.localeCompare(right.name, "ko-KR"),
      );
  }, [snapshot]);

  const displayedTimeLeft = useMemo(() => {
    if (!snapshot) return null;
    if (snapshot.phase !== "playing" || !snapshot.timerRunning) {
      return snapshot.timeLeftMs;
    }
    return Math.max(0, snapshot.timeLeftMs - (clockNow - receivedAt));
  }, [clockNow, receivedAt, snapshot]);

  if (loading && !snapshot) {
    return (
      <View style={styles.stateBox} accessibilityState={{ busy: true }}>
        <ActivityIndicator color={colors.accent} />
        <Text selectable style={styles.muted}>
          그림자연합 게임을 불러오는 중이에요.
        </Text>
      </View>
    );
  }

  if (!snapshot) {
    return (
      <View style={styles.stateBox}>
        <Text selectable style={styles.error} accessibilityLiveRegion="assertive">
          {error ?? "게임 상태를 불러오지 못했어요."}
        </Text>
        <ActionButton label="다시 시도" onPress={() => void load(true)} />
      </View>
    );
  }

  const terminal = snapshot.phase === "finished" || snapshot.phase === "host-ended";
  const connection = reconnecting ? "reconnecting" : error ? "offline" : "online";

  return (
    <>
      <GameAreaShell
        title={data.board.title}
        roundLabel={phaseLabel(snapshot)}
        timeLeftMs={snapshot.phase === "playing" ? displayedTimeLeft : null}
        score={ownParticipant?.power ?? null}
        scoreLabel="파워"
        rulesLabel="목표에 가까운 팀이 10,000 파워 획득"
        connection={connection}
        inputLocked={loading || reconnecting}
        statusMessage={error}
        onExit={
          terminal || ownParticipant?.forfeitedAt != null
            ? null
            : () => setExitVisible(true)
        }
        exitLabel="게임 나가기"
      >
        <View style={styles.root}>
          {error ? (
            <Text selectable style={styles.error} accessibilityLiveRegion="assertive">
              {error}
            </Text>
          ) : null}

          {snapshot.phase === "lobby" ? (
            <GameLobby
              title={`${data.board.title} 대기실`}
              description="입장 후 준비하기를 누르고 진행자의 시작을 기다려 주세요."
              participants={snapshot.participants.map((participant) => ({
                id: participant.studentId,
                name: participant.name,
                state: participantState(participant),
              }))}
              error={error}
              participantMessage={
                ownParticipant?.readyAt != null
                  ? "준비가 완료됐어요."
                  : "준비하기를 누르면 시작 명단에 포함됩니다."
              }
              actions={
                ownParticipant ? (
                  <ActionButton
                    label={ownParticipant.readyAt != null ? "준비 완료" : "준비하기"}
                    disabled={
                      loading ||
                      ownParticipant.joinedAt == null ||
                      ownParticipant.readyAt != null
                    }
                    onPress={() => void command("ready")}
                  />
                ) : null
              }
            />
          ) : null}

          {snapshot.phase === "playing" ? (
            <>
              <View style={styles.commandCard} accessibilityLabel="이번 라운드 목표 숫자">
                <Text selectable style={styles.eyebrow}>TARGET COMMAND</Text>
                <Text selectable style={[styles.commandNumber, styles.tabular]}>
                  {snapshot.command ?? "미공개"}
                </Text>
                <Text selectable style={styles.muted}>
                  팀 평균이 목표에 가까우면 10,000 파워를 제출 숫자 비율대로 나눠 받아요.
                </Text>
              </View>
              <View style={styles.inputPanel}>
                <Text selectable style={styles.subtitle}>1부터 100 사이 숫자 제출</Text>
                <View style={styles.submitRow}>
                  <TextField
                    accessibilityLabel="제출할 숫자"
                    value={numberDraft}
                    editable={
                      !loading &&
                      !reconnecting &&
                      (displayedTimeLeft ?? 0) > 0 &&
                      ownParticipant?.forfeitedAt == null
                    }
                    keyboardType="number-pad"
                    maxLength={3}
                    onChangeText={setNumberDraft}
                    style={styles.numberInput}
                  />
                  <ActionButton
                    label={ownParticipant?.submitted ? "숫자 수정" : "숫자 제출"}
                    disabled={
                      loading ||
                      reconnecting ||
                      (displayedTimeLeft ?? 0) <= 0 ||
                      ownParticipant?.joinedAt == null ||
                      ownParticipant?.forfeitedAt != null ||
                      (ownParticipant?.submitted === true && !snapshot.editable)
                    }
                    onPress={() => {
                      const number = Number(numberDraft);
                      if (!Number.isInteger(number) || number < 1 || number > 100) {
                        setError("1부터 100 사이의 정수를 입력해 주세요.");
                        return;
                      }
                      void command("submit", number);
                    }}
                  />
                </View>
                {ownParticipant?.submitted ? (
                  <Text selectable style={styles.submitted} accessibilityLiveRegion="polite">
                    {ownParticipant.ownNumber != null
                      ? `${ownParticipant.ownNumber}을(를) 제출했어요.`
                      : "숫자를 제출했어요."}
                    {snapshot.editable ? " 제한 시간 전까지 수정할 수 있어요." : ""}
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}

          {snapshot.phase === "revealing" || snapshot.phase === "postround" ? (
            <RoundReveal snapshot={snapshot} />
          ) : null}

          {terminal ? (
            <TerminalResult
              snapshot={snapshot}
              ownParticipant={ownParticipant}
              rankedParticipants={rankedParticipants}
              onBack={() => router.back()}
            />
          ) : (
            <Scoreboard participants={rankedParticipants} />
          )}

          <Text selectable style={styles.runtimeMeta}>
            session {snapshot.id} · v{snapshot.version}
          </Text>
        </View>
      </GameAreaShell>

      <GameExitDialog
        visible={exitVisible}
        title="그림자연합에서 나갈까요?"
        description="나가면 현재 파워로 기권 결과가 확정되고 다른 참가자의 게임은 계속됩니다."
        confirmLabel="기권하고 나가기"
        busy={loading}
        onCancel={() => setExitVisible(false)}
        onConfirm={async () => {
          const next = await command("forfeit");
          if (next) setExitVisible(false);
        }}
      />
    </>
  );
}

function RoundReveal({ snapshot }: { snapshot: ShadowAllianceSnapshot }) {
  const result = snapshot.lastResult;
  if (!result) {
    return (
      <Text selectable style={styles.notice} accessibilityLiveRegion="polite">
        공개된 결과를 불러오는 중이에요.
      </Text>
    );
  }
  return (
    <View style={styles.resultCard} accessibilityLabel="라운드 결과">
      <View style={styles.resultHeader}>
        <View style={styles.resultTitleBlock}>
          <Text selectable style={styles.eyebrow}>ROUND {result.round}</Text>
          <Text selectable style={styles.title}>
            {result.winner === "tie"
              ? "무승부"
              : `${teamLabel(result.winner)} 승리`}
          </Text>
        </View>
        <Text selectable style={styles.commandBadge}>목표 {result.command}</Text>
      </View>
      <View style={styles.averageGrid}>
        <Metric label="검정 평균" value={result.blackAverage ?? "제출 없음"} />
        <Metric label="검정 거리" value={result.blackDifference ?? "없음"} />
        <Metric label="흰색 평균" value={result.whiteAverage ?? "제출 없음"} />
        <Metric label="흰색 거리" value={result.whiteDifference ?? "없음"} />
      </View>
      <View style={styles.revealList}>
        {result.players.map((player) => (
          <View style={styles.revealRow} key={player.studentId}>
            <View style={styles.scoreMain}>
              <Text selectable style={styles.scoreName}>{player.name}</Text>
              <Text selectable style={styles.team}>{teamLabel(player.team)}</Text>
            </View>
            <Text selectable style={styles.muted}>제출 {player.number ?? "없음"}</Text>
            <Text selectable style={[styles.score, styles.tabular]}>
              +{player.gain.toLocaleString("ko-KR")}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TerminalResult({
  snapshot,
  ownParticipant,
  rankedParticipants,
  onBack,
}: {
  snapshot: ShadowAllianceSnapshot;
  ownParticipant: ShadowAllianceSnapshot["participants"][number] | null;
  rankedParticipants: ShadowAllianceSnapshot["participants"];
  onBack: () => void;
}) {
  const ownRank = ownParticipant
    ? rankedParticipants.findIndex(
        (participant) => participant.studentId === ownParticipant.studentId,
      ) + 1
    : 0;
  return (
    <GameResultPanel
      outcome={
        ownParticipant?.forfeitedAt != null
          ? "forfeit"
          : snapshot.phase === "host-ended"
            ? "host-ended"
            : "completed"
      }
      score={ownParticipant?.power ?? null}
      durationMs={
        snapshot.startedAt != null && snapshot.completedAt != null
          ? snapshot.completedAt - snapshot.startedAt
          : null
      }
      metrics={[
        ...(ownRank > 0 ? [{ label: "개인 순위", value: `${ownRank}위` }] : []),
        ...(ownParticipant
          ? [
              { label: "라운드 승리", value: `${ownParticipant.roundWins}회` },
              { label: "팀", value: teamLabel(ownParticipant.team) },
            ]
          : []),
      ]}
      message="서버가 확정한 파워와 순위만 나의 전적에 기록됩니다."
      actions={<ActionButton label="게임 목록" onPress={onBack} />}
    />
  );
}

function Scoreboard({
  participants,
}: {
  participants: ShadowAllianceSnapshot["participants"];
}) {
  return (
    <View style={styles.scoreboard} accessibilityLabel="파워 순위">
      <Text selectable style={styles.subtitle}>파워 순위</Text>
      {participants.map((participant, index) => (
        <View style={styles.scoreRow} key={participant.studentId}>
          <View style={styles.scoreMain}>
            <Text selectable style={styles.scoreName}>
              {index + 1}위 · {participant.name}
            </Text>
            <Text selectable style={styles.team}>{teamLabel(participant.team)}</Text>
          </View>
          <Text selectable style={[styles.score, styles.tabular]}>
            {participant.power.toLocaleString("ko-KR")} 파워
            {participant.lastGain > 0
              ? ` (+${participant.lastGain.toLocaleString("ko-KR")})`
              : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.metric}>
      <Text selectable style={styles.metricLabel}>{label}</Text>
      <Text selectable style={[styles.metricValue, styles.tabular]}>{value}</Text>
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
    <AppButton disabled={disabled} onPress={onPress} style={styles.actionButton}>
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
  eyebrow: { ...typography.micro, color: colors.textMuted },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.subtitle, color: colors.text },
  muted: { ...typography.body, color: colors.textMuted },
  notice: {
    ...typography.body,
    color: colors.warningTintedText,
    padding: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.warningTintedBg,
  },
  error: { ...typography.body, color: colors.danger },
  commandCard: {
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xl,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
  },
  commandNumber: { ...typography.display, color: colors.text },
  inputPanel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
  },
  submitRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.md,
  },
  numberInput: {
    minWidth: gamePlatform.metricMinWidth,
    flexGrow: 1,
    fontVariant: ["tabular-nums"],
  },
  submitted: {
    ...typography.label,
    color: colors.plantActive,
    padding: spacing.lg,
    borderRadius: radii.control,
    backgroundColor: colors.noticeSuccessBg,
  },
  resultCard: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
  },
  resultHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  resultTitleBlock: { flex: 1, gap: spacing.xs },
  commandBadge: {
    ...typography.label,
    color: colors.onAccent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.gameFrame,
  },
  averageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  metric: {
    minWidth: gamePlatform.metricMinWidth,
    flexGrow: 1,
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.bg,
  },
  metricLabel: { ...typography.micro, color: colors.textMuted },
  metricValue: { ...typography.subtitle, color: colors.text },
  revealList: { gap: spacing.sm },
  revealRow: {
    minHeight: controls.fab,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.bg,
  },
  scoreboard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
  },
  scoreRow: {
    minHeight: controls.fab,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.bg,
  },
  scoreMain: { flex: 1, gap: spacing.xs },
  scoreName: { ...typography.label, color: colors.text },
  team: { ...typography.micro, color: colors.textMuted },
  score: { ...typography.label, color: colors.text },
  actionButton: {
    minHeight: tapMin,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radii.control,
    borderCurve: "continuous",
  },
  runtimeMeta: { ...typography.micro, color: colors.textFaint },
  tabular: { fontVariant: ["tabular-nums"] },
});
