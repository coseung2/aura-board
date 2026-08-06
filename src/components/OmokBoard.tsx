"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { OfficialSlimeSprite } from "@/components/creatures/OfficialSlimeSprite";
import type { SlimeColor } from "@/lib/pets/slime-assets";
import { boardChannelKey, PLAY_SESSION_CHANGED_EVENT } from "@/lib/realtime";
import {
  createOmokRematch,
  cancelOmokMatch,
  createOmokSession,
  fetchCurrentOmokSession,
  fetchOmokRoster,
  fetchOmokMatchmaking,
  fetchOmokPlayerProfiles,
  makeOmokCommand,
  PlayClientError,
  submitOmokCommand,
  requestOmokMatch,
} from "@/lib/play-platform/browser-client";
import {
  isOmokSnapshot,
  mergeOmokCommandSnapshot,
  type OmokIntent,
  type OmokMatchmakingStatus,
  type OmokPlayerProfile,
  type OmokRosterStudent,
  type OmokSlot,
  type OmokSnapshot,
  type PlayCommandRequest,
} from "@/lib/play-platform/contracts";
import styles from "./OmokBoard.module.css";

type Props = {
  boardId: string;
  boardTitle: string;
  viewer: "teacher" | "student";
  matchmakingEnabled?: boolean;
};

type PendingCommand = {
  sessionId: string;
  request: PlayCommandRequest;
};

const STAR_POINTS = new Set(["3:3", "3:11", "7:7", "11:3", "11:11"]);

export function OmokBoard({ boardId, boardTitle, viewer, matchmakingEnabled = false }: Props) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<OmokSnapshot | null>(null);
  const [roster, setRoster] = useState<OmokRosterStudent[]>([]);
  const [selected, setSelected] = useState<[string, string]>(["", ""]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const [matchmaking, setMatchmaking] = useState<OmokMatchmakingStatus>({ status: "idle", playerCount: 0 });
  const [profiles, setProfiles] = useState<OmokPlayerProfile[]>([]);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const requestSequence = useRef(0);
  const autoRetriedRequest = useRef<string | null>(null);
  const storageKey = `aura-play-pending:${boardId}`;

  const readPending = useCallback((): PendingCommand | null => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const value = JSON.parse(raw) as PendingCommand;
      if (
        !value ||
        typeof value.sessionId !== "string" ||
        !value.request ||
        typeof value.request.requestId !== "string" ||
        !Number.isSafeInteger(value.request.expectedVersion)
      ) {
        window.localStorage.removeItem(storageKey);
        return null;
      }
      return value;
    } catch {
      return null;
    }
  }, [storageKey]);

  const clearPending = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
    setHasPending(false);
  }, [storageKey]);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setSyncing(true);
    try {
      const next = await fetchCurrentOmokSession(boardId);
      if (sequence !== requestSequence.current) return;
      setSnapshot(next);
      setError(null);
      if (!next && viewer === "teacher" && !matchmakingEnabled) {
        const students = await fetchOmokRoster(boardId);
        if (sequence !== requestSequence.current) return;
        setRoster(students);
        setSelected((current) => [
          current[0] || students[0]?.id || "",
          current[1] || students.find((student) => student.id !== students[0]?.id)?.id || "",
        ]);
      }
      const pending = readPending();
      setHasPending(!!pending && pending.sessionId === next?.sessionId);
    } catch (cause) {
      if (sequence !== requestSequence.current) return;
      setError(messageForError(cause));
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setSyncing(false);
      }
    }
  }, [boardId, matchmakingEnabled, readPending, viewer]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtimeInvalidation({
    channelName: boardChannelKey(boardId),
    event: PLAY_SESSION_CHANGED_EVENT,
    refresh,
    fallbackPollMs: 10_000,
  });

  const refreshMatchmaking = useCallback(async () => {
    if (viewer !== "student" || !matchmakingEnabled) return;
    try {
      const next = await fetchOmokMatchmaking(boardId);
      setMatchmaking(next);
      if (next.status === "matched" && next.href) router.replace(next.href);
    } catch (cause) {
      setError(messageForError(cause));
    }
  }, [boardId, matchmakingEnabled, router, viewer]);

  useEffect(() => {
    if (viewer !== "student" || !matchmakingEnabled) return;
    void refreshMatchmaking();
  }, [matchmakingEnabled, refreshMatchmaking, viewer]);

  useEffect(() => {
    if (matchmaking.status !== "waiting") return;
    const timer = window.setInterval(refreshMatchmaking, 2_000);
    return () => window.clearInterval(timer);
  }, [matchmaking.status, refreshMatchmaking]);

  useEffect(() => {
    if (!snapshot) return;
    void fetchOmokPlayerProfiles(snapshot.sessionId)
      .then((next) => {
        setProfiles(next.players);
        setStartedAtMs(next.startedAtMs);
      })
      .catch(() => undefined);
  }, [snapshot?.sessionId]);

  useEffect(() => {
    if (snapshot?.roomStatus !== "active") return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [snapshot?.roomStatus]);

  const executeCommand = useCallback(
    async (pending: PendingCommand, persist = true) => {
      if (persist) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(pending));
        } catch {
          // The in-memory request still retains its idempotency key.
        }
      }
      setHasPending(true);
      setBusy(true);
      setError(null);
      try {
        const response = await submitOmokCommand(pending.sessionId, pending.request);
        setSnapshot((current) =>
          mergeOmokCommandSnapshot(current, pending.sessionId, response.snapshot),
        );
        clearPending();
      } catch (cause) {
        if (cause instanceof PlayClientError) {
          const recovered = cause.body.snapshot;
          if (cause.status === 409 && isOmokSnapshot(recovered)) {
            setSnapshot((current) =>
              mergeOmokCommandSnapshot(current, pending.sessionId, recovered),
            );
            clearPending();
            setError("다른 화면에서 상태가 먼저 바뀌어 최신 판으로 동기화했어요.");
            return;
          }
          if (cause.status < 500 && cause.status !== 408) clearPending();
        }
        setError(messageForError(cause));
      } finally {
        setBusy(false);
      }
    },
    [clearPending, storageKey],
  );

  useEffect(() => {
    if (!snapshot || busy) return;
    const pending = readPending();
    if (
      !pending ||
      pending.sessionId !== snapshot.sessionId ||
      autoRetriedRequest.current === pending.request.requestId
    ) {
      return;
    }
    autoRetriedRequest.current = pending.request.requestId;
    void executeCommand(pending, false);
  }, [busy, executeCommand, readPending, snapshot]);

  const sendIntent = useCallback(
    (command: OmokIntent) => {
      if (!snapshot || busy || syncing) return;
      void executeCommand({
        sessionId: snapshot.sessionId,
        request: makeOmokCommand(snapshot, command),
      });
    },
    [busy, executeCommand, snapshot, syncing],
  );

  async function createSession() {
    if (!selected[0] || !selected[1] || selected[0] === selected[1]) {
      setError("서로 다른 학생 두 명을 선택해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await createOmokSession(boardId, selected);
      setSnapshot(response.snapshot);
    } catch (cause) {
      if (cause instanceof PlayClientError && cause.body.error === "session_already_exists") {
        await refresh();
        return;
      }
      setError(messageForError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function rematch() {
    if (!snapshot || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await createOmokRematch(snapshot.sessionId);
      clearPending();
      setSnapshot(response.snapshot);
    } catch (cause) {
      if (cause instanceof PlayClientError && cause.status === 409) {
        await refresh();
        return;
      }
      setError(messageForError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function startMatchmaking() {
    setBusy(true);
    setError(null);
    try {
      const next = await requestOmokMatch(boardId);
      setMatchmaking(next);
      if (next.status === "matched" && next.href) router.replace(next.href);
    } catch (cause) {
      setError(messageForError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function stopMatchmaking() {
    setBusy(true);
    try {
      setMatchmaking(await cancelOmokMatch(boardId));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className={styles.shell} aria-label={boardTitle}>
        <div className={styles.panel}>
          <div className={styles.createPanel} role="status">
            대국 정보를 불러오는 중이에요…
          </div>
        </div>
      </section>
    );
  }

  if (!snapshot) {
    if (viewer === "student" && matchmakingEnabled) {
      const waiting = matchmaking.status === "waiting";
      return (
        <section className={styles.shell} aria-label={boardTitle}>
          <div className={styles.matchPanel}>
            <p className={styles.eyebrow}>온라인 오목</p>
            <h1 className={styles.title}>{waiting ? "상대를 찾는 중" : "오목 매칭"}</h1>
            <div className={styles.matchSignal} aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <p className={styles.message} role="status" aria-live="polite">
              {waiting
                ? `현재 ${matchmaking.playerCount}명이 입장해 있어요.`
                : "매칭을 잡으면 같은 학급의 상대와 바로 대국을 시작해요."}
            </p>
            <button
              className={waiting ? styles.secondaryButton : styles.button}
              type="button"
              disabled={busy}
              onClick={() => void (waiting ? stopMatchmaking() : startMatchmaking())}
            >
              {busy ? "처리 중…" : waiting ? "매칭 취소" : "매칭 잡기"}
            </button>
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>
        </section>
      );
    }
    if (viewer === "teacher" && matchmakingEnabled) {
      return (
        <section className={styles.shell} aria-label={boardTitle}>
          <div className={styles.matchPanel}>
            <p className={styles.eyebrow}>온라인 오목</p>
            <h1 className={styles.title}>학생 매칭 대기</h1>
            <p className={styles.message}>
              학생이 직접 매칭을 잡으면 같은 학급의 상대와 대국이 시작됩니다.
              현재 입장 인원과 대국 상태는 놀이보드에서 확인할 수 있어요.
            </p>
          </div>
        </section>
      );
    }
    return (
      <section className={styles.shell} aria-label={boardTitle}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>1:1 온라인 대국</p>
            <h1 className={styles.title}>{boardTitle || "오목 대국"}</h1>
          </div>
        </header>
        <div className={styles.panel}>
          <div className={styles.createPanel}>
            <h2>{viewer === "teacher" ? "첫 대국 만들기" : "대국 준비 중"}</h2>
            <p className={styles.message}>
              {viewer === "teacher"
                ? "같은 학급의 학생 두 명을 선택하면 서버가 흑·백 자리를 고정합니다."
                : "교사가 대국 상대를 정하면 이 화면에 자동으로 나타납니다."}
            </p>
            {viewer === "teacher" && (
              <>
                <div className={styles.selectGrid}>
                  {[0, 1].map((index) => (
                    <label className={styles.selectLabel} key={index}>
                      {index === 0 ? "첫 번째 자리 (흑)" : "두 번째 자리 (백)"}
                      <select
                        className={styles.select}
                        value={selected[index]}
                        onChange={(event) =>
                          setSelected((current) => {
                            const next: [string, string] = [...current];
                            next[index] = event.target.value;
                            return next;
                          })
                        }
                        disabled={busy}
                      >
                        <option value="">학생 선택</option>
                        {roster.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.number ? `${student.number}번 ` : ""}
                            {student.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <button
                  className={styles.button}
                  type="button"
                  onClick={() => void createSession()}
                  disabled={busy || roster.length < 2}
                >
                  대국 만들기
                </button>
              </>
            )}
            {error && <p className={styles.error}>{error}</p>}
          </div>
        </div>
      </section>
    );
  }

  const myParticipant = snapshot.viewer.slot
    ? snapshot.participants.find((participant) => participant.slot === snapshot.viewer.slot)
    : null;
  const turnParticipant = snapshot.participants.find(
    (participant) => participant.slot === snapshot.game.nextTurn,
  );
  const canPlace =
    snapshot.viewer.role === "participant" &&
    snapshot.roomStatus === "active" &&
    snapshot.viewer.slot === snapshot.game.nextTurn &&
    !busy &&
    !syncing;
  const statusText = describeStatus(snapshot, turnParticipant?.displayName ?? null);
  return (
    <section className={styles.shell} aria-label={boardTitle}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>1:1 온라인 대국</p>
          <h1 className={styles.title}>{boardTitle || "오목 대국"}</h1>
        </div>
        <span className={styles.version} role="status">
          {syncing ? "동기화 중" : "실시간 연결"}
        </span>
      </header>

      <div className={styles.panel}>
        <div className={styles.content}>
          <div className={styles.boardWrap}>
            <div className={styles.board} role="grid" aria-label="15줄 오목판">
              {snapshot.game.board.map((cell, index) => {
                const row = Math.floor(index / 15);
                const column = index % 15;
                const last =
                  snapshot.game.lastMove?.position.row === row &&
                  snapshot.game.lastMove.position.column === column;
                const playable = canPlace && cell === null;
                return (
                  <button
                    className={`${styles.cell} ${STAR_POINTS.has(`${row}:${column}`) ? styles.star : ""}`}
                    type="button"
                    role="gridcell"
                    key={`${row}:${column}`}
                    aria-label={`${row + 1}행 ${column + 1}열${cell ? `, ${slotLabel(cell)} 돌` : ", 빈 칸"}`}
                    disabled={!playable}
                    onClick={() =>
                      sendIntent({ type: "place_stone", position: { row, column } })
                    }
                  >
                    {cell && (
                      <span
                        className={`${styles.stone} ${cell === "first" ? styles.first : styles.second} ${last ? styles.lastMove : ""}`}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className={styles.sidebar}>
            {snapshot.participants.map((participant, index) => {
              const profile = profileFor(profiles, participant.slot);
              return (
                <Fragment key={participant.slot}>
                  <div className={styles.card}>
                    <h2 className={styles.cardTitle}>
                      {participant.slot === "first" ? "흑돌 플레이어" : "백돌 플레이어"}
                    </h2>
                <div className={styles.playerRow} key={participant.slot}>
                  <div className={styles.playerIdentity}>
                    <div className={styles.petThumb}>
                      {profile?.pet ? (
                        <OfficialSlimeSprite
                          slimeColor={profile.pet.color as SlimeColor}
                          growthStage={profile.pet.growthStage}
                          scale={1}
                          alt={`${profile.name} 대표 펫`}
                        />
                      ) : (
                        <span aria-hidden>?</span>
                      )}
                    </div>
                    <span
                      className={`${styles.dot} ${participant.slot === "first" ? styles.first : styles.second}`}
                      aria-hidden="true"
                    />
                    <span className={styles.playerName}>{participant.displayName}</span>
                    <span className={styles.playerRecord}>
                      {recordLabel(profile)}
                    </span>
                  </div>
                  <span className={styles.badge}>
                    {participant.ready ? "준비됨" : "대기"}
                  </span>
                </div>
                  </div>
                  {index === 0 ? (
                    <div className={styles.matchInfo} role="status" aria-live="polite">
                      <div><span>대국 시간</span><strong>{formatElapsed(startedAtMs, clockNow)}</strong></div>
                      <div><span>현재 상태</span><strong>{statusText}</strong></div>
                      <div><span>착수</span><strong>{snapshot.game.moveCount}수</strong></div>
                    </div>
                  ) : null}
                </Fragment>
              );
            })}

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>진행 안내</h2>
              <p className={styles.message}>{actionHint(snapshot)}</p>
            </div>

            <div className={styles.actions}>
              {snapshot.viewer.role === "participant" &&
                snapshot.roomStatus === "waiting" &&
                !myParticipant?.ready && (
                  <button
                    className={styles.button}
                    type="button"
                    disabled={busy || syncing}
                    onClick={() => sendIntent({ type: "ready" })}
                  >
                    준비 완료
                  </button>
                )}
              {snapshot.viewer.role === "host" && snapshot.roomStatus === "ready" && (
                <button
                  className={styles.button}
                  type="button"
                  disabled={busy || syncing}
                  onClick={() => sendIntent({ type: "start" })}
                >
                  대국 시작
                </button>
              )}
              {snapshot.viewer.role === "participant" && snapshot.roomStatus === "active" && (
                <button
                  className={styles.dangerButton}
                  type="button"
                  disabled={busy || syncing}
                  onClick={() => sendIntent({ type: "resign" })}
                >
                  기권하기
                </button>
              )}
              {snapshot.viewer.role === "host" && snapshot.roomStatus === "finished" && (
                <button
                  className={styles.button}
                  type="button"
                  disabled={busy || syncing}
                  onClick={() => void rematch()}
                >
                  자리 바꿔 재대국
                </button>
              )}
              {hasPending && (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const pending = readPending();
                    if (pending) void executeCommand(pending, false);
                  }}
                >
                  미확인 요청 다시 보내기
                </button>
              )}
              <button
                className={styles.secondaryButton}
                type="button"
                disabled={busy || syncing}
                onClick={() => void refresh()}
              >
                최신 상태 확인
              </button>
            </div>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

function slotLabel(slot: OmokSlot | null): string {
  if (slot === "first") return "흑";
  if (slot === "second") return "백";
  return "관전자";
}

function profileFor(profiles: OmokPlayerProfile[], slot: OmokSlot) {
  return profiles.find((profile) => profile.slot === slot) ?? null;
}

function recordLabel(profile: OmokPlayerProfile | null): string {
  if (!profile) return "전적 확인 중";
  const total = profile.record.wins + profile.record.losses + profile.record.draws;
  if (total === 0) return "첫 대국";
  return `${profile.record.wins}승 ${profile.record.losses}패 ${profile.record.draws}무`;
}

function formatElapsed(startedAtMs: number | null, now: number): string {
  const seconds = startedAtMs == null ? 0 : Math.max(0, Math.floor((now - startedAtMs) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function describeStatus(snapshot: OmokSnapshot, turnName: string | null): string {
  switch (snapshot.roomStatus) {
    case "waiting":
      return `준비 대기 · ${snapshot.participants.filter((participant) => participant.ready).length}/2`;
    case "ready":
      return "두 참가자 준비 완료";
    case "active":
      return `${turnName ?? slotLabel(snapshot.game.nextTurn)} 차례`;
    case "finished": {
      if (!snapshot.outcome?.winner) return "무승부";
      const winner = snapshot.participants.find(
        (participant) => participant.slot === snapshot.outcome?.winner,
      );
      return `${winner?.displayName ?? slotLabel(snapshot.outcome.winner)} 승리`;
    }
  }
}

function actionHint(snapshot: OmokSnapshot): string {
  if (snapshot.roomStatus === "waiting") {
    return snapshot.viewer.role === "host"
      ? "학생 두 명이 각자 준비 완료를 누를 때까지 기다려 주세요."
      : "준비 완료를 누르면 교사가 대국을 시작할 수 있어요.";
  }
  if (snapshot.roomStatus === "ready") {
    return snapshot.viewer.role === "host"
      ? "두 학생이 준비됐어요. 대국 시작을 눌러 주세요."
      : "교사가 곧 대국을 시작합니다.";
  }
  if (snapshot.roomStatus === "active") {
    return snapshot.viewer.role === "host"
      ? "모든 착수는 Rust 규칙 엔진에서 검증되고 확정됩니다."
      : snapshot.viewer.slot === snapshot.game.nextTurn
        ? "내 차례예요. 빈 교차점을 선택해 주세요."
        : "상대 차례예요. 최신 상태는 자동으로 동기화됩니다.";
  }
  if (!snapshot.outcome) return "대국이 종료됐습니다.";
  if (snapshot.outcome.reason === "resignation") return "기권으로 대국이 종료됐습니다.";
  if (snapshot.outcome.reason === "draw") return "판이 가득 차 무승부로 종료됐습니다.";
  return "다섯 돌이 이어져 대국이 종료됐습니다.";
}

function messageForError(error: unknown): string {
  if (error instanceof PlayClientError) {
    switch (error.body.error) {
      case "invalid_phase":
        return "지금 단계에서는 그 동작을 할 수 없어요. 최신 상태를 확인해 주세요.";
      case "domain_rejected":
        return "그 자리는 둘 수 없거나 내 차례가 아니에요.";
      case "forbidden":
        return "이 대국에 참여할 권한이 없어요.";
      case "play_engine_unavailable":
        return "게임 서버에 연결할 수 없어요. 요청은 보관했으며 다시 시도할 수 있어요.";
      case "idempotency_key_reuse":
        return "요청 식별자가 충돌했어요. 최신 상태에서 다시 시도해 주세요.";
      default:
        return `게임 요청을 처리하지 못했어요 (${error.body.error}).`;
    }
  }
  return "네트워크 연결을 확인해 주세요. 미확인 요청은 같은 식별자로 다시 보낼 수 있어요.";
}
