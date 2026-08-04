"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameAreaShell } from "@/components/game-platform/GameAreaShell";
import { GameExitDialog } from "@/components/game-platform/GameExitDialog";
import { GameLobby } from "@/components/game-platform/GameLobby";
import { GameResultPanel } from "@/components/game-platform/GameResultPanel";
import type {
  ShadowAllianceSnapshot,
  ShadowAllianceTeam,
} from "@/lib/shadow-alliance/contracts";
import styles from "./shadow-alliance-authority.module.css";

type Props = {
  boardId: string;
  boardTitle: string;
  viewer: "teacher" | "student";
};

type CommandAction =
  | "join"
  | "ready"
  | "forfeit"
  | "submit"
  | "settings"
  | "rebalance"
  | "start"
  | "pause"
  | "resume"
  | "reveal"
  | "postround"
  | "next"
  | "finish"
  | "end-early"
  | "rematch";

type CommandOptions = {
  number?: number;
  editable?: boolean;
  timerSec?: number;
};

type PendingCommand = {
  requestId: string;
  runId: string;
  expectedVersion: number;
  fingerprint: string;
};

type ErrorPayload = {
  error?: string;
  snapshot?: ShadowAllianceSnapshot;
};

function createRequestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function readJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

function errorLabel(code: string | undefined): string {
  switch (code) {
    case "version_conflict":
      return "다른 기기에서 상태가 바뀌어 서버의 최신 게임을 반영했어요.";
    case "participants_not_ready":
      return "입장한 참가자가 모두 준비해야 시작할 수 있어요.";
    case "not_enough_participants":
      return "두 명 이상 입장해야 시작할 수 있어요.";
    case "teams_not_balanced":
      return "검정 팀과 흰색 팀에 각각 한 명 이상 필요해요.";
    case "already_submitted":
      return "이번 라운드 숫자는 이미 제출됐어요.";
    case "round_expired":
      return "제출 시간이 끝났어요. 진행자의 공개를 기다려 주세요.";
    case "participant_forfeited":
      return "이미 게임에서 나간 참가자예요.";
    case "invalid_number":
      return "1부터 100 사이의 정수를 입력해 주세요.";
    case "invalid_state":
      return "현재 단계에서는 이 조작을 할 수 없어요.";
    case "session_terminal":
      return "이미 끝난 게임이에요.";
    case "storage_error":
    case "play_engine_unavailable":
      return "게임 서버 연결이 불안정해요. 잠시 후 다시 시도해 주세요.";
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
      return `${snapshot.round}/${snapshot.totalRounds} 라운드 입력`;
    case "revealing":
      return `${snapshot.round}/${snapshot.totalRounds} 라운드 결과`;
    case "postround":
      return `${snapshot.round}/${snapshot.totalRounds} 라운드 정리`;
    case "finished":
      return "게임 완료";
    case "host-ended":
      return "진행자 종료";
  }
}

function commandFingerprint(
  action: CommandAction,
  options: CommandOptions,
  snapshot: ShadowAllianceSnapshot,
): string {
  return JSON.stringify({
    action,
    number: options.number ?? null,
    editable: options.editable ?? null,
    timerSec: options.timerSec ?? null,
    phase: snapshot.phase,
    round: snapshot.round,
  });
}

export function ShadowAllianceBoard({ boardId, boardTitle, viewer }: Props) {
  const [snapshot, setSnapshot] = useState<ShadowAllianceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [numberDraft, setNumberDraft] = useState("50");
  const [editableDraft, setEditableDraft] = useState(true);
  const [timerDraft, setTimerDraft] = useState("300");
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
    setEditableDraft(next.editable);
  }, []);

  const load = useCallback(
    async (mode: "initial" | "poll" | "retry" = "poll") => {
      if (mode === "initial") setLoading(true);
      else setReconnecting(true);
      try {
        const response = await fetch(
          `/api/shadow-alliance/boards/${encodeURIComponent(boardId)}`,
          { cache: "no-store", headers: { accept: "application/json" } },
        );
        const body = await readJson<{
          snapshot?: ShadowAllianceSnapshot;
          error?: string;
        }>(response);
        if (response.status === 404) {
          setSnapshot(null);
          setError(null);
          return null;
        }
        if (!response.ok || !body?.snapshot) {
          if (mode !== "poll" || !snapshotRef.current) {
            setError(errorLabel(body?.error));
          }
          return null;
        }
        acceptSnapshot(body.snapshot);
        setError(null);
        if (
          commandRef.current &&
          body.snapshot.version !== commandRef.current.expectedVersion
        ) {
          commandRef.current = null;
        }
        return body.snapshot;
      } catch {
        if (mode !== "poll") {
          setError("게임 서버에 연결하지 못했어요. 다시 시도해 주세요.");
        }
        return null;
      } finally {
        setLoading(false);
        setReconnecting(false);
      }
    },
    [acceptSnapshot, boardId],
  );

  useEffect(() => {
    setSnapshot(null);
    setError(null);
    setExitOpen(false);
    commandRef.current = null;
    joinedRunRef.current = null;
    void load("initial");
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load("poll"), 2_500);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (snapshot?.phase !== "playing" || !snapshot.timerRunning) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [snapshot?.phase, snapshot?.timerRunning]);

  const ownParticipant = useMemo(() => {
    if (viewer !== "student" || !snapshot) return null;
    return snapshot.participants.find((participant) => participant.isSelf) ?? null;
  }, [snapshot, viewer]);

  const command = useCallback(
    async (action: CommandAction, options: CommandOptions = {}) => {
      const current = snapshotRef.current;
      if (!current) return null;
      const fingerprint = commandFingerprint(action, options, current);
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
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/shadow-alliance/boards/${encodeURIComponent(boardId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              requestId: envelope.requestId,
              runId: envelope.runId,
              expectedVersion: envelope.expectedVersion,
              action,
              ...(options.number === undefined ? {} : { number: options.number }),
              ...(options.editable === undefined
                ? {}
                : { editable: options.editable }),
              ...(options.timerSec === undefined
                ? {}
                : { timerSec: options.timerSec }),
            }),
          },
        );
        const body = await readJson<
          | { snapshot: ShadowAllianceSnapshot; replayed?: boolean }
          | ErrorPayload
        >(response);
        if (!response.ok) {
          if (body && "snapshot" in body && body.snapshot) {
            acceptSnapshot(body.snapshot);
            if (body.snapshot.version !== envelope.expectedVersion) {
              commandRef.current = null;
            }
          }
          setError(errorLabel(body && "error" in body ? body.error : undefined));
          return null;
        }
        if (!body || !("snapshot" in body) || !body.snapshot) {
          setError("최신 게임 상태를 확인하지 못했어요.");
          return null;
        }
        commandRef.current = null;
        if (action === "rematch") joinedRunRef.current = null;
        acceptSnapshot(body.snapshot);
        return body.snapshot;
      } catch {
        setError(
          "게임 서버에 연결하지 못했어요. 같은 요청 ID로 안전하게 다시 시도할 수 있어요.",
        );
        return null;
      } finally {
        setBusy(false);
      }
    },
    [acceptSnapshot, boardId],
  );

  useEffect(() => {
    if (
      viewer !== "student" ||
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
  }, [command, ownParticipant, snapshot, viewer]);

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
      <section className={styles.root} aria-busy="true">
        <p className={styles.notice} role="status">
          그림자연합 게임을 불러오는 중이에요.
        </p>
      </section>
    );
  }

  if (!snapshot) {
    if (!error) {
      return (
        <section className={`${styles.root} ${styles.waitingRoom}`} aria-live="polite">
          <p className={styles.waitingEyebrow}>익명 대기실</p>
          <h2 className={styles.waitingTitle}>그림자연합</h2>
          <p className={styles.waitingCopy}>
            익명 공작원으로 합류할 준비가 됐어요. 진행자가 본부를 열면 첫 지령이 도착합니다.
          </p>
          <p className={styles.waitingMeta}>
            닉네임과 소속은 게임 안에서만 쓰이며, 실제 이름은 표시되지 않습니다.
          </p>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void load("retry")}
          >
            다시 확인
          </button>
        </section>
      );
    }
    return (
      <section className={styles.root}>
        <p className={styles.error} role="alert">
          {error ?? "게임 상태를 불러오지 못했어요."}
        </p>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => void load("retry")}
        >
          다시 시도
        </button>
      </section>
    );
  }

  const terminal = snapshot.phase === "finished" || snapshot.phase === "host-ended";
  const connection = reconnecting ? "reconnecting" : error ? "offline" : "online";
  const participantActions = viewer === "student" && !terminal ? (
    <button
      type="button"
      className={styles.dangerButton}
      disabled={busy || reconnecting || ownParticipant?.forfeitedAt != null}
      onClick={() => setExitOpen(true)}
    >
      게임 나가기
    </button>
  ) : null;

  const hostControls = viewer === "teacher" && !terminal ? (
    <HostControls
      snapshot={snapshot}
      busy={busy || reconnecting}
      editableDraft={editableDraft}
      timerDraft={timerDraft}
      onEditableChange={setEditableDraft}
      onTimerChange={setTimerDraft}
      onCommand={command}
      displayedTimeLeft={displayedTimeLeft ?? 0}
    />
  ) : null;

  return (
    <>
      <GameAreaShell
        title={boardTitle}
        roundLabel={phaseLabel(snapshot)}
        timeLeftMs={snapshot.phase === "playing" ? displayedTimeLeft : null}
        score={ownParticipant?.power ?? null}
        scoreLabel="파워"
        rulesLabel="목표에 가까운 팀이 10,000 파워 획득"
        connection={connection}
        inputLocked={busy || reconnecting}
        statusMessage={error}
        hostControls={hostControls}
        participantActions={participantActions}
      >
        <section className={styles.root}>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          {snapshot.phase === "lobby" ? (
            <GameLobby
              title={`${boardTitle} 대기실`}
              description="익명 참가자가 입장하고 준비하면 진행자가 팀과 제한 시간을 확인한 뒤 시작합니다."
              participants={snapshot.participants.map((participant) => ({
                id: participant.studentId,
                name: participant.name,
                state: participantState(participant),
              }))}
              participantMessage={
                viewer === "student" && ownParticipant
                  ? ownParticipant.readyAt != null
                    ? "준비가 완료됐어요. 진행자의 시작을 기다려 주세요."
                    : "준비하기를 누르면 시작 명단에 포함됩니다."
                  : null
              }
              actions={
                viewer === "student" && ownParticipant ? (
                  <button
                    type="button"
                    className={styles.button}
                    disabled={
                      busy ||
                      reconnecting ||
                      ownParticipant.joinedAt == null ||
                      ownParticipant.readyAt != null
                    }
                    onClick={() => void command("ready")}
                  >
                    {ownParticipant.readyAt != null ? "준비 완료" : "준비하기"}
                  </button>
                ) : null
              }
            />
          ) : null}

          {snapshot.phase === "playing" ? (
            <PlayingRound
              snapshot={snapshot}
              viewer={viewer}
              ownParticipant={ownParticipant}
              numberDraft={numberDraft}
              disabled={busy || reconnecting || (displayedTimeLeft ?? 0) <= 0}
              onNumberChange={setNumberDraft}
              onSubmit={() => {
                const number = Number(numberDraft);
                if (!Number.isInteger(number) || number < 1 || number > 100) {
                  setError("1부터 100 사이의 정수를 입력해 주세요.");
                  return;
                }
                void command("submit", { number });
              }}
            />
          ) : null}

          {snapshot.phase === "revealing" || snapshot.phase === "postround" ? (
            <RoundReveal snapshot={snapshot} />
          ) : null}

          {terminal ? (
            <TerminalResult
              snapshot={snapshot}
              viewer={viewer}
              ownParticipant={ownParticipant}
              rankedParticipants={rankedParticipants}
              busy={busy}
              onRematch={() => void command("rematch")}
            />
          ) : (
            <Scoreboard participants={rankedParticipants} />
          )}

          <p className={styles.runtimeMeta}>
            session {snapshot.id} · v{snapshot.version}
          </p>
        </section>
      </GameAreaShell>

      <GameExitDialog
        open={exitOpen}
        title="그림자연합에서 나갈까요?"
        description="진행 중 나가면 현재 파워로 기권 결과가 확정됩니다. 다른 참가자의 게임은 계속됩니다."
        confirmLabel="기권하고 나가기"
        busy={busy}
        onCancel={() => setExitOpen(false)}
        onConfirm={async () => {
          const result = await command("forfeit");
          if (result) setExitOpen(false);
        }}
      />
    </>
  );
}

function HostControls({
  snapshot,
  busy,
  editableDraft,
  timerDraft,
  onEditableChange,
  onTimerChange,
  onCommand,
  displayedTimeLeft,
}: {
  snapshot: ShadowAllianceSnapshot;
  busy: boolean;
  editableDraft: boolean;
  timerDraft: string;
  onEditableChange: (value: boolean) => void;
  onTimerChange: (value: string) => void;
  onCommand: (
    action: CommandAction,
    options?: CommandOptions,
  ) => Promise<ShadowAllianceSnapshot | null>;
  displayedTimeLeft: number;
}) {
  if (snapshot.phase === "lobby") {
    const timerSec = Number(timerDraft);
    return (
      <div className={styles.hostControlStack}>
        <div className={styles.settingsRow}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={editableDraft}
              onChange={(event) => onEditableChange(event.target.checked)}
            />
            제출 후 수정 허용
          </label>
          <label className={styles.fieldLabel}>
            제한 시간(초)
            <input
              className={styles.numberInput}
              type="number"
              min={10}
              max={3600}
              step={10}
              value={timerDraft}
              onChange={(event) => onTimerChange(event.target.value)}
            />
          </label>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy || !Number.isInteger(timerSec) || timerSec < 10 || timerSec > 3600}
            onClick={() =>
              void onCommand("settings", {
                editable: editableDraft,
                timerSec,
              })
            }
          >
            설정 저장
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy}
            onClick={() => void onCommand("rebalance")}
          >
            팀 재배정
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() => void onCommand("start")}
          >
            게임 시작
          </button>
          <button
            type="button"
            className={styles.dangerButton}
            disabled={busy}
            onClick={() => void onCommand("end-early")}
          >
            세션 종료
          </button>
        </div>
      </div>
    );
  }

  if (snapshot.phase === "playing") {
    return (
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={busy || displayedTimeLeft <= 0}
          onClick={() =>
            void onCommand(snapshot.timerRunning ? "pause" : "resume")
          }
        >
          {snapshot.timerRunning ? "일시정지" : "계속"}
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={busy || (!snapshot.allSubmitted && displayedTimeLeft > 0)}
          onClick={() => void onCommand("reveal")}
        >
          숫자 공개·결과 계산
        </button>
        <button
          type="button"
          className={styles.dangerButton}
          disabled={busy}
          onClick={() => void onCommand("end-early")}
        >
          조기 종료
        </button>
      </div>
    );
  }

  if (snapshot.phase === "revealing") {
    return (
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          disabled={busy}
          onClick={() => void onCommand("postround")}
        >
          라운드 정리
        </button>
        <button
          type="button"
          className={styles.dangerButton}
          disabled={busy}
          onClick={() => void onCommand("end-early")}
        >
          조기 종료
        </button>
      </div>
    );
  }

  if (snapshot.phase === "postround") {
    return (
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          disabled={busy}
          onClick={() =>
            void onCommand(
              snapshot.round >= snapshot.totalRounds ? "finish" : "next",
            )
          }
        >
          {snapshot.round >= snapshot.totalRounds ? "게임 완료" : "다음 라운드"}
        </button>
        <button
          type="button"
          className={styles.dangerButton}
          disabled={busy}
          onClick={() => void onCommand("end-early")}
        >
          조기 종료
        </button>
      </div>
    );
  }

  return null;
}

function PlayingRound({
  snapshot,
  viewer,
  ownParticipant,
  numberDraft,
  disabled,
  onNumberChange,
  onSubmit,
}: {
  snapshot: ShadowAllianceSnapshot;
  viewer: Props["viewer"];
  ownParticipant: ShadowAllianceSnapshot["participants"][number] | null;
  numberDraft: string;
  disabled: boolean;
  onNumberChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <section className={styles.commandCard} aria-label="이번 라운드 목표 숫자">
        <p className={styles.eyebrow}>TARGET COMMAND</p>
        <strong className={styles.commandNumber}>{snapshot.command ?? "미공개"}</strong>
        <p className={styles.meta}>
          팀 평균이 목표 숫자에 더 가까우면 그 팀이 10,000 파워를 제출 비율대로 나눠 받습니다.
        </p>
      </section>

      {viewer === "student" ? (
        <section className={styles.choicePanel} aria-label="숫자 제출">
          <h3>1부터 100 사이 숫자 제출</h3>
          {ownParticipant?.forfeitedAt != null ? (
            <p className={styles.error}>기권한 뒤에는 제출할 수 없어요.</p>
          ) : (
            <div className={styles.submitRow}>
              <input
                className={styles.largeNumberInput}
                aria-label="제출할 숫자"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                step={1}
                value={numberDraft}
                disabled={disabled || ownParticipant?.joinedAt == null}
                onChange={(event) => onNumberChange(event.target.value)}
              />
              <button
                type="button"
                className={styles.button}
                disabled={
                  disabled ||
                  ownParticipant?.joinedAt == null ||
                  (ownParticipant?.submitted === true && !snapshot.editable)
                }
                onClick={onSubmit}
              >
                {ownParticipant?.submitted ? "숫자 수정" : "숫자 제출"}
              </button>
            </div>
          )}
          {ownParticipant?.submitted ? (
            <p className={styles.submitted} role="status">
              {ownParticipant.ownNumber != null
                ? `${ownParticipant.ownNumber}을(를) 제출했어요.`
                : "숫자를 제출했어요."}
              {snapshot.editable ? " 제한 시간 전까지 수정할 수 있어요." : ""}
            </p>
          ) : null}
        </section>
      ) : (
        <section className={styles.hostPanel} aria-label="제출 현황">
          <h3>제출 현황</h3>
          <ul className={styles.hostList}>
            {snapshot.participants
              .filter(
                (participant) =>
                  participant.joinedAt != null && participant.forfeitedAt == null,
              )
              .map((participant) => (
                <li className={styles.hostRow} key={participant.studentId}>
                  <strong>{participant.name}</strong>
                  <span className={styles.team}>{teamLabel(participant.team)}</span>
                  <span>{participant.submitted ? "제출 완료" : "입력 중"}</span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </>
  );
}

function RoundReveal({ snapshot }: { snapshot: ShadowAllianceSnapshot }) {
  const result = snapshot.lastResult;
  if (!result) {
    return (
      <p className={styles.notice} role="status">
        공개된 라운드 결과를 불러오는 중이에요.
      </p>
    );
  }
  return (
    <section className={styles.resultCard} aria-label="라운드 결과">
      <div className={styles.resultHeader}>
        <div>
          <p className={styles.eyebrow}>ROUND {result.round}</p>
          <h2 className={styles.title}>
            {result.winner === "tie"
              ? "무승부"
              : `${teamLabel(result.winner)} 승리`}
          </h2>
        </div>
        <strong className={styles.commandBadge}>목표 {result.command}</strong>
      </div>
      <dl className={styles.averageGrid}>
        <div>
          <dt>검정 팀 평균</dt>
          <dd>{result.blackAverage ?? "제출 없음"}</dd>
        </div>
        <div>
          <dt>검정 팀 거리</dt>
          <dd>{result.blackDifference ?? "없음"}</dd>
        </div>
        <div>
          <dt>흰색 팀 평균</dt>
          <dd>{result.whiteAverage ?? "제출 없음"}</dd>
        </div>
        <div>
          <dt>흰색 팀 거리</dt>
          <dd>{result.whiteDifference ?? "없음"}</dd>
        </div>
      </dl>
      <ul className={styles.revealList}>
        {result.players.map((player) => (
          <li className={styles.revealRow} key={player.studentId}>
            <div>
              <strong>{player.name}</strong>
              <span className={styles.team}>{teamLabel(player.team)}</span>
            </div>
            <span>제출 {player.number ?? "없음"}</span>
            <strong>+{player.gain.toLocaleString("ko-KR")}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TerminalResult({
  snapshot,
  viewer,
  ownParticipant,
  rankedParticipants,
  busy,
  onRematch,
}: {
  snapshot: ShadowAllianceSnapshot;
  viewer: Props["viewer"];
  ownParticipant: ShadowAllianceSnapshot["participants"][number] | null;
  rankedParticipants: ShadowAllianceSnapshot["participants"];
  busy: boolean;
  onRematch: () => void;
}) {
  const ownRank = ownParticipant
    ? rankedParticipants.findIndex(
        (participant) => participant.studentId === ownParticipant.studentId,
      ) + 1
    : 0;
  return (
    <>
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
        message={
          snapshot.phase === "host-ended"
            ? "진행자가 게임을 종료했습니다. 서버가 확정한 현재 파워가 기록됩니다."
            : "모든 라운드가 끝났습니다."
        }
        retryAction={
          viewer === "teacher" ? (
            <button
              type="button"
              className={styles.button}
              disabled={busy}
              onClick={onRematch}
            >
              새 세션으로 다시 하기
            </button>
          ) : null
        }
        gamesAction={
          viewer === "student" ? (
            <Link
              className={styles.secondaryButton}
              href="/student/boards?category=play&playTab=games"
            >
              게임 목록
            </Link>
          ) : null
        }
        recordsAction={
          viewer === "student" ? (
            <Link
              className={styles.secondaryButton}
              href="/student/boards?category=play&playTab=records&game=shadow-alliance"
            >
              나의 전적
            </Link>
          ) : null
        }
      />
      <Scoreboard participants={rankedParticipants} />
    </>
  );
}

function Scoreboard({
  participants,
}: {
  participants: ShadowAllianceSnapshot["participants"];
}) {
  return (
    <section className={styles.scoreboard} aria-label="파워 순위">
      <h3>파워 순위</h3>
      <ol className={styles.scoreList}>
        {participants.map((participant, index) => (
          <li className={styles.scoreRow} key={participant.studentId}>
            <div>
              <span className={styles.rank}>{index + 1}위</span>{" "}
              <strong>{participant.name}</strong>
            </div>
            <span className={styles.team}>{teamLabel(participant.team)}</span>
            <strong>
              {participant.power.toLocaleString("ko-KR")} 파워
              {participant.lastGain > 0
                ? ` (+${participant.lastGain.toLocaleString("ko-KR")})`
                : ""}
            </strong>
          </li>
        ))}
      </ol>
    </section>
  );
}
