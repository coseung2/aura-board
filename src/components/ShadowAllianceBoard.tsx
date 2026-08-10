"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { ShadowAllianceStudentGame } from "@/features/shadow-alliance/components/ShadowAllianceStudentGame";
import { ShadowAllianceTeacherGame } from "@/features/shadow-alliance/components/ShadowAllianceTeacherGame";
import type {
  ShadowAllianceGame as LegacyGame,
  ShadowAlliancePlayer as LegacyPlayer,
  ShadowAlliancePlayerSnapshot as LegacyPlayerSnapshot,
  ShadowAllianceResult as LegacyResult,
  ShadowAllianceSnapshot as LegacySnapshot,
  ShadowAllianceTeam as LegacyTeam,
} from "@/features/shadow-alliance/types";
import type {
  ShadowAllianceSnapshot,
  ShadowAllianceTeam,
} from "@/lib/shadow-alliance/contracts";
import { boardChannelKey, PLAY_SESSION_CHANGED_EVENT } from "@/lib/realtime";

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
      return "다른 기기에서 상태가 바뀌어 최신 게임을 반영했어요.";
    case "participants_not_ready":
      return "입장한 참가자가 모두 준비해야 시작할 수 있어요.";
    case "not_enough_participants":
      return "두 명 이상 입장해야 시작할 수 있어요.";
    case "teams_not_balanced":
      return "블랙 연합과 화이트 연합에 각각 한 명 이상 필요해요.";
    case "already_submitted":
      return "이번 라운드 숫자는 이미 제출됐어요.";
    case "round_expired":
      return "제출 시간이 끝났어요.";
    case "invalid_number":
      return "1부터 100 사이의 정수를 입력해 주세요.";
    case "storage_error":
    case "play_engine_unavailable":
      return "게임 서버 연결이 불안정해요. 잠시 후 다시 시도해 주세요.";
    default:
      return "요청을 처리하지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
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

function legacyTeam(team: ShadowAllianceTeam, index: number): LegacyTeam {
  if (team === "black" || team === "white") return team;
  return index % 2 === 0 ? "black" : "white";
}

function legacyResult(
  snapshot: ShadowAllianceSnapshot,
  players: LegacyPlayer[],
): LegacyResult | null {
  const result = snapshot.lastResult;
  if (!result) return null;

  const numbers = new Map(
    result.players.map((player) => [player.studentId, player.number]),
  );
  const gains = Object.fromEntries(
    result.players.map((player) => [player.studentId, player.gain]),
  );
  const resultPlayers = players.map((player) => ({
    ...player,
    number: numbers.get(player.id) ?? null,
    lastGain: gains[player.id] ?? player.lastGain,
  }));

  return {
    command: result.command,
    winner: result.winner,
    blackAvg: result.blackAverage,
    whiteAvg: result.whiteAverage,
    blackDiff: result.blackDifference,
    whiteDiff: result.whiteDifference,
    black: resultPlayers.filter((player) => player.team === "black"),
    white: resultPlayers.filter((player) => player.team === "white"),
    gains,
  };
}

function toLegacyGame(
  snapshot: ShadowAllianceSnapshot,
  timeLeftMs: number,
  timerSec: number,
): LegacyGame {
  const joined = snapshot.participants.filter(
    (participant) => participant.joinedAt != null,
  );
  const players = joined.map<LegacyPlayer>((participant, index) => ({
    id: participant.studentId,
    nick: participant.name,
    team: legacyTeam(participant.team, index),
    power: participant.power,
    number: participant.submitted ? 0 : null,
    lastGain: participant.lastGain,
  }));
  const result = legacyResult(snapshot, players);

  return {
    phase:
      snapshot.phase === "finished" || snapshot.phase === "host-ended"
        ? "final"
        : snapshot.phase,
    totalRounds: snapshot.totalRounds,
    round: snapshot.round,
    command: snapshot.command,
    editable: snapshot.editable,
    timerSec,
    timeLeft: Math.max(0, Math.ceil(timeLeftMs / 1000)),
    timerRunning: snapshot.timerRunning,
    players,
    usedNicknames: players.map((player) => player.nick),
    lastResult: result,
    history: result ? [result] : [],
  };
}

function toLegacySnapshot(
  snapshot: ShadowAllianceSnapshot,
  timeLeftMs: number,
  ownStudentId?: string | null,
): LegacySnapshot {
  const joined = snapshot.participants.filter(
    (participant) => participant.joinedAt != null || participant.isSelf,
  );
  const players = joined.map<LegacyPlayerSnapshot>((participant, index) => ({
    id: participant.studentId,
    nick:
      participant.isSelf || participant.studentId === ownStudentId
        ? participant.name
        : participant.name,
    team: legacyTeam(participant.team, index),
    power: participant.power,
    lastGain: participant.lastGain,
    submitted: participant.submitted,
  }));
  const resultPlayers = players.map<LegacyPlayer>((player) => ({
    ...player,
    number: null,
  }));
  const result = legacyResult(snapshot, resultPlayers);
  if (result && ownStudentId) {
    const own = snapshot.participants.find(
      (participant) => participant.studentId === ownStudentId,
    );
    if (own && result.gains[ownStudentId] == null) {
      result.gains[ownStudentId] = own.lastGain;
    }
  }

  return {
    phase:
      snapshot.phase === "finished" || snapshot.phase === "host-ended"
        ? "final"
        : snapshot.phase,
    totalRounds: snapshot.totalRounds,
    round: snapshot.round,
    command: snapshot.command,
    editable: snapshot.editable,
    timeLeft: Math.max(0, Math.ceil(timeLeftMs / 1000)),
    timerRunning: snapshot.timerRunning,
    players,
    lastResult: result,
  };
}

export function ShadowAllianceBoard({ boardId, boardTitle, viewer }: Props) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<ShadowAllianceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timerDraft, setTimerDraft] = useState("300");
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const [clockNow, setClockNow] = useState(Date.now());
  const commandRef = useRef<PendingCommand | null>(null);
  const joinedRunRef = useRef<string | null>(null);
  const readyRunRef = useRef<string | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const acceptSnapshot = useCallback((next: ShadowAllianceSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
    const now = Date.now();
    setReceivedAt(now);
    setClockNow(now);
  }, []);

  const load = useCallback(
    async (mode: "initial" | "refresh" | "retry" = "refresh") => {
      if (mode === "initial") setLoading(true);
      else if (mode === "retry") setReconnecting(true);
      try {
        const response = await fetch(
          `/api/shadow-alliance/boards/${encodeURIComponent(boardId)}`,
          { cache: "no-store", headers: { accept: "application/json" } },
        );
        const body = await readJson<{
          snapshot?: ShadowAllianceSnapshot;
          error?: string;
        }>(response);
        if (!response.ok || !body?.snapshot) {
          if (mode !== "refresh" || !snapshotRef.current) {
            setError(errorLabel(body?.error));
          }
          return null;
        }
        acceptSnapshot(body.snapshot);
        setError(null);
        return body.snapshot;
      } catch {
        if (mode !== "refresh" || !snapshotRef.current) {
          setError("게임 서버에 연결하지 못했어요. 다시 시도해 주세요.");
        }
        return null;
      } finally {
        setLoading(false);
        if (mode === "retry") setReconnecting(false);
      }
    },
    [acceptSnapshot, boardId],
  );

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
          const errorCode = body && "error" in body ? body.error : undefined;
          if (body && "snapshot" in body && body.snapshot) {
            acceptSnapshot(body.snapshot);
          }
          if (errorCode === "version_conflict") {
            commandRef.current = null;
            setError(
              action === "settings"
                ? null
                : "게임 상태가 갱신됐어요. 다시 시도해 주세요.",
            );
            return null;
          }
          setError(errorLabel(errorCode));
          return null;
        }
        if (!body || !("snapshot" in body) || !body.snapshot) {
          setError("최신 게임 상태를 확인하지 못했어요.");
          return null;
        }
        commandRef.current = null;
        if (action === "rematch") {
          joinedRunRef.current = null;
          readyRunRef.current = null;
        }
        acceptSnapshot(body.snapshot);
        return body.snapshot;
      } catch {
        setError("게임 서버에 연결하지 못했어요. 다시 시도해 주세요.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [acceptSnapshot, boardId],
  );

  useEffect(() => {
    setSnapshot(null);
    setError(null);
    commandRef.current = null;
    joinedRunRef.current = null;
    readyRunRef.current = null;
    void load("initial");
  }, [load]);

  const refreshFromAuthority = useCallback(async () => {
    await load("refresh");
  }, [load]);

  useRealtimeInvalidation({
    channelName: boardChannelKey(boardId),
    event: PLAY_SESSION_CHANGED_EVENT,
    refresh: refreshFromAuthority,
    fallbackPollMs: 10_000,
  });

  useEffect(() => {
    if (snapshot?.phase !== "playing" || !snapshot.timerRunning) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [snapshot?.phase, snapshot?.timerRunning]);

  const ownParticipant = useMemo(() => {
    if (viewer !== "student" || !snapshot) return null;
    return snapshot.participants.find((participant) => participant.isSelf) ?? null;
  }, [snapshot, viewer]);

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

  useEffect(() => {
    if (
      viewer !== "student" ||
      !snapshot ||
      !ownParticipant ||
      ownParticipant.joinedAt == null ||
      ownParticipant.readyAt != null ||
      readyRunRef.current === snapshot.id
    ) {
      return;
    }
    readyRunRef.current = snapshot.id;
    void command("ready").then((next) => {
      if (!next) readyRunRef.current = null;
    });
  }, [command, ownParticipant, snapshot, viewer]);

  const displayedTimeLeft = useMemo(() => {
    if (!snapshot) return 0;
    if (snapshot.phase !== "playing" || !snapshot.timerRunning) {
      return snapshot.timeLeftMs;
    }
    return Math.max(0, snapshot.timeLeftMs - (clockNow - receivedAt));
  }, [clockNow, receivedAt, snapshot]);

  const connection = reconnecting
    ? "reconnecting"
    : error
      ? "offline"
      : snapshot
        ? "connected"
        : "connecting";

  if (loading && !snapshot) {
    return (
      <section className="shadow-alliance-board" aria-label={boardTitle}>
        <main className="shadow-alliance-game shadow-alliance-centered">
          <p className="shadow-alliance-eyebrow">본부 연결 중</p>
          <h1>그림자연합</h1>
          <p>게임 상태를 불러오고 있습니다.</p>
        </main>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="shadow-alliance-board" aria-label={boardTitle}>
        <main className="shadow-alliance-game shadow-alliance-centered">
          <p className="shadow-alliance-eyebrow">연결 오류</p>
          <h1>그림자연합</h1>
          <p role="alert">{error ?? "게임 상태를 불러오지 못했어요."}</p>
          <button
            type="button"
            className="shadow-alliance-button secondary"
            onClick={() => void load("retry")}
          >
            다시 시도
          </button>
        </main>
      </section>
    );
  }

  const legacyGame = toLegacyGame(
    snapshot,
    displayedTimeLeft,
    Number(timerDraft),
  );
  const legacySnapshot = toLegacySnapshot(
    snapshot,
    displayedTimeLeft,
    ownParticipant?.studentId,
  );
  const ownLegacyPlayer = ownParticipant
    ? {
        id: ownParticipant.studentId,
        nick: ownParticipant.name,
        team: legacyTeam(
          ownParticipant.team,
          Math.max(
            0,
            snapshot.participants.findIndex(
              (participant) => participant.studentId === ownParticipant.studentId,
            ),
          ),
        ),
        power: ownParticipant.power,
        lastGain: ownParticipant.lastGain,
        submitted: ownParticipant.submitted,
      }
    : null;
  const rankings = [...legacyGame.players].sort(
    (left, right) =>
      right.power - left.power || left.nick.localeCompare(right.nick, "ko-KR"),
  );

  if (viewer === "student") {
    return (
      <section className="shadow-alliance-board" aria-label={boardTitle}>
        {error ? <p className="shadow-alliance-error" role="alert">{error}</p> : null}
        <ShadowAllianceStudentGame
          connection={connection}
          joinPending={busy || reconnecting || ownParticipant?.joinedAt == null}
          player={ownLegacyPlayer}
          snapshot={legacySnapshot}
          onContinue={() => router.push("/student/boards?category=play")}
          onRetryJoin={() => {
            joinedRunRef.current = null;
            readyRunRef.current = null;
            void load("retry");
          }}
          onSubmitNumber={(number) => void command("submit", { number })}
        />
      </section>
    );
  }

  return (
    <section className="shadow-alliance-board" aria-label={boardTitle}>
      {error ? <p className="shadow-alliance-error" role="alert">{error}</p> : null}
      <ShadowAllianceTeacherGame
        game={legacyGame}
        connection={connection}
        rankings={rankings}
        rosterManagedByClassroom
        onAddPlayer={() => undefined}
        onRemovePlayer={() => undefined}
        onRebalanceTeams={() => void command("rebalance")}
        onSetSettings={(settings) => {
          const editable = settings.editable ?? snapshot.editable;
          const timerSec = settings.timerSec ?? Number(timerDraft);
          setTimerDraft(String(timerSec));
          // Optimistic UI for the editable toggle; server remains authority and
          // any conflict snapshot silently replaces this local value.
          if (settings.editable !== undefined) {
            setSnapshot((current) =>
              current ? { ...current, editable: settings.editable! } : current,
            );
          }
          void command("settings", { editable, timerSec });
        }}
        onStartGame={() => {
          const needsTeams = snapshot.participants.some(
            (participant) =>
              participant.joinedAt != null && participant.team === "unassigned",
          );
          void (async () => {
            if (needsTeams && !(await command("rebalance"))) return;
            await command("start");
          })();
        }}
        sessionActionBusy={busy || reconnecting}
        onContinueGame={async () => {
          const current = snapshotRef.current;
          if (current?.phase === "playing" && current.timerRunning) {
            const paused = await command("pause");
            if (paused) return true;
            const latest = await load("refresh");
            return Boolean(
              latest &&
                (latest.phase !== "playing" || !latest.timerRunning),
            );
          }
          return true;
        }}
        onExitGame={async () => {
          const ended = await command("end-early");
          if (
            ended?.phase === "host-ended" ||
            ended?.phase === "finished"
          ) {
            return true;
          }

          // The authoritative mutation can commit even when a later response
          // step fails. Re-read the server state before telling the teacher the
          // game is still active or leaving them stranded on a stale screen.
          const latest = await load("refresh");
          if (
            latest?.phase === "host-ended" ||
            latest?.phase === "finished"
          ) {
            return true;
          }
          setError("게임을 종료하지 못했어요. 다시 시도해 주세요.");
          return false;
        }}
        onResetGame={() => void command("rematch")}
        onNextRound={() => void command("next")}
        onRevealRound={() => void command("reveal")}
        onShowPostround={() => void command("postround")}
        onSetTimerRunning={(running) =>
          void command(running ? "resume" : "pause")
        }
      />
    </section>
  );
}
