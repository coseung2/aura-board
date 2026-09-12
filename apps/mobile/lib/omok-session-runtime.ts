import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AppState } from "react-native";
import { ApiError } from "./api";
import {
  OMOK_PROTOCOL_VERSION,
  type OmokServerFrame,
} from "./omok-protocol";
import {
  adoptPending,
  aimAt,
  applyCommitted,
  applyRejection,
  applyServerFrame,
  clearAim,
  confirmAim,
  ingestSnapshot,
  initialOmokMachineState,
  markPendingUnconfirmed,
  omokRejectionMessage,
  setError,
  startIntent,
  type OmokAim,
  type OmokEffect,
  type OmokMachineState,
  type OmokPending,
  type OmokTransition,
} from "./omok-move-machine";
import {
  OMOK_ACK_TIMEOUT_MS,
  OMOK_ACTIVE_POLL_INTERVAL_MS,
  createNativeOmokConnect,
  createOmokSocket,
  shouldPollActiveOmokGame,
  type OmokSocketStatus,
} from "./omok-socket";
import { createOmokSubmitLock } from "./omok-submit-lock";
import {
  clearPendingOmokCommand,
  fetchCurrentOmokSession,
  fetchOmokRealtimeTicket,
  loadPendingOmokCommand,
  makeOmokCommand,
  migrateLegacyPendingOmokCommand,
  playApiError,
  requestOmokRematch,
  savePendingOmokCommand,
  submitOmokCommand,
  type OmokIntent,
  type OmokSnapshot,
} from "./play-platform";

type Action =
  | { kind: "transition"; transition: OmokTransition }
  | { kind: "replace"; state: OmokMachineState };

function machineReducer(state: OmokMachineState, action: Action): OmokMachineState {
  return action.kind === "replace" ? action.state : action.transition.state;
}

/** Built once: the connector is stateless and holds no per-session data. */
const nativeConnect = createNativeOmokConnect();

export type OmokRuntime = {
  state: OmokMachineState;
  loading: boolean;
  busy: boolean;
  socketStatus: OmokSocketStatus;
  offline: boolean;
  refresh: () => Promise<void>;
  aim: (position: OmokAim) => void;
  cancelAim: () => void;
  confirm: () => void;
  sendIntent: (command: Exclude<OmokIntent, { type: "place_stone" }>) => void;
  rematch: () => void;
};

/**
 * Owns the Omok session: one version reducer for every snapshot source, a
 * synchronous submit lock, durable pending replay, the Rust game socket, and
 * bounded HTTP recovery. Bot sessions stay on the HTTP command path.
 */
export function useOmokSessionRuntime({
  boardId,
  onPlacementFeedback,
  onUnauthorized,
}: {
  boardId: string;
  onPlacementFeedback: () => void;
  onUnauthorized: () => void;
}): OmokRuntime {
  const [state, dispatch] = useReducer(machineReducer, initialOmokMachineState);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [socketStatus, setSocketStatus] = useState<OmokSocketStatus>("idle");
  const [offline, setOffline] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;
  const lockRef = useRef(createOmokSubmitLock());
  const socketRef = useRef<ReturnType<typeof createOmokSocket> | null>(null);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const migratedRef = useRef(false);
  const adoptedRef = useRef<string | null>(null);
  const transportRef = useRef<"unknown" | "websocket" | "http" | "blocked">("unknown");

  const apply = useCallback((transition: OmokTransition) => {
    stateRef.current = transition.state;
    dispatch({ kind: "transition", transition });
    return transition.effects;
  }, []);

  const clearAckTimer = useCallback(() => {
    if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
    ackTimerRef.current = null;
  }, []);

  /** Snapshot ingestion for HTTP reads. Session changes only come from an
   * explicit replacement or current-session discovery. */
  const ingest = useCallback(
    (snapshot: OmokSnapshot, replacesSession: boolean) => {
      const effects = apply(ingestSnapshot(stateRef.current, snapshot, { replacesSession }));
      void runEffects(effects);
    },
    // runEffects is stable via refs below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apply],
  );

  const runEffectsRef = useRef<(effects: OmokEffect[]) => Promise<void>>(async () => undefined);
  const runEffects = useCallback(
    (effects: OmokEffect[]) => runEffectsRef.current(effects),
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const next = await fetchCurrentOmokSession(boardId);
      if (!next) {
        setLoading(false);
        return;
      }
      // A session id we have never seen is authoritative discovery: it also
      // recovers a rematch replacement whose notification was missed.
      ingest(next, next.sessionId !== stateRef.current.snapshot?.sessionId);
      setOffline(false);
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        (cause.status === 401 || cause.status === 403)
      ) {
        onUnauthorized();
        return;
      }
      if (cause instanceof ApiError && (cause.status === 0 || cause.status === 408)) {
        setOffline(true);
      }
      apply(setError(stateRef.current, omokHttpErrorMessage(cause)));
    } finally {
      setLoading(false);
    }
  }, [apply, boardId, ingest, onUnauthorized]);

  /** HTTP command path: also the fallback whenever the socket is not ready. */
  const submitOverHttp = useCallback(
    async (pending: OmokPending) => {
      try {
        const response = await submitOmokCommand(pending.sessionId, pending.request);
        clearAckTimer();
        const effects = apply(
          applyCommitted(stateRef.current, {
            type: "command_committed",
            protocolVersion: OMOK_PROTOCOL_VERSION,
            sessionId: pending.sessionId,
            requestId: response.requestId,
            commandType: pending.request.command.type,
            previousVersion: response.previousVersion,
            version: response.version,
            // An HTTP receipt replay is indistinguishable here and must not
            // re-fire placement feedback either way.
            replayed: true,
            snapshot: response.snapshot,
          }),
        );
        setOffline(false);
        await runEffects(effects);
      } catch (cause) {
        const body = playApiError(cause);
        const status = cause instanceof ApiError ? cause.status : 0;
        if (status === 409 || (status >= 400 && status < 500 && status !== 408)) {
          clearAckTimer();
          const effects = apply(
            applyRejection(stateRef.current, {
              type: "command_rejected",
              protocolVersion: OMOK_PROTOCOL_VERSION,
              sessionId: pending.sessionId,
              requestId: pending.request.requestId,
              commandType: pending.request.command.type,
              error: body?.error ?? (status === 409 ? "version_conflict" : "domain_rejected"),
              retryable: false,
              currentVersion: body?.currentVersion ?? null,
              snapshot: body?.snapshot ?? null,
            }),
          );
          await runEffects(effects);
          return;
        }
        // Timeout or server error: keep the durable pending and stay 확인 중.
        if (status === 0 || status === 408) setOffline(true);
        const transition = markPendingUnconfirmed(stateRef.current);
        apply(transition);
        clearAckTimer();
        ackTimerRef.current = setTimeout(() => {
          ackTimerRef.current = null;
          void runEffects(transition.effects);
        }, OMOK_ACK_TIMEOUT_MS);
      } finally {
        lockRef.current.release();
        setBusy(false);
      }
    },
    [apply, clearAckTimer, runEffects],
  );

  const send = useCallback(
    async (pending: OmokPending) => {
      setBusy(true);
      const socket = socketRef.current;

      if (transportRef.current === "blocked") {
        setBusy(false);
        lockRef.current.release();
        return;
      }

      clearAckTimer();
      ackTimerRef.current = setTimeout(() => {
        ackTimerRef.current = null;
        const transition = markPendingUnconfirmed(stateRef.current);
        const effects = apply(transition);
        void runEffects(effects);
      }, OMOK_ACK_TIMEOUT_MS);

      const overSocket =
        transportRef.current !== "http" &&
        !!socket &&
        socket.sendCommand({
          type: "command",
          protocolVersion: OMOK_PROTOCOL_VERSION,
          requestId: pending.request.requestId,
          expectedVersion: pending.request.expectedVersion,
          commandSchemaVersion: pending.request.commandSchemaVersion,
          command: pending.request.command,
        });
      if (overSocket) return;
      await submitOverHttp(pending);
    },
    [apply, clearAckTimer, submitOverHttp],
  );

  runEffectsRef.current = async (effects: OmokEffect[]) => {
    for (const effect of effects) {
      switch (effect.type) {
        case "placement_feedback":
          onPlacementFeedback();
          break;
        case "persist_pending":
          // The UI has already painted; persistence is never awaited before it.
          void savePendingOmokCommand(effect.pending).catch(() => undefined);
          break;
        case "clear_pending":
          clearAckTimer();
          lockRef.current.release();
          setBusy(false);
          void clearPendingOmokCommand(effect.sessionId, effect.commandType).catch(
            () => undefined,
          );
          break;
        case "send":
          await send(effect.pending);
          break;
        case "session_replaced":
          adoptedRef.current = null;
          transportRef.current = "unknown";
          socketRef.current?.dispose();
          socketRef.current = null;
          setSocketStatus("idle");
          break;
      }
    }
  };

  /** Socket lifecycle, recreated when the authoritative session changes. */
  const sessionId = state.snapshot?.sessionId ?? null;
  useEffect(() => {
    if (!sessionId) {
      socketRef.current?.dispose();
      socketRef.current = null;
      transportRef.current = "unknown";
      setSocketStatus("idle");
      return;
    }
    transportRef.current = "unknown";
    const client = createOmokSocket({
      requestTicket: async () => {
        try {
          const issued = await fetchOmokRealtimeTicket(sessionId);
          transportRef.current = issued.transport;
          return issued;
        } catch (cause) {
          if (!shouldRetryOmokRealtimeTicketError(cause)) {
            transportRef.current = "blocked";
            if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
              onUnauthorized();
            } else {
              apply(setError(stateRef.current, omokRealtimeTicketErrorMessage(cause)));
            }
          }
          throw cause;
        }
      },
      shouldRetryTicketError: shouldRetryOmokRealtimeTicketError,
      // Origin is always explicit: the native module would otherwise derive it
      // from the URL, which the engine cannot allowlist safely.
      connect: nativeConnect,
      lastSeenVersion: () => stateRef.current.snapshot?.version ?? null,
      onStatus: setSocketStatus,
      onFrame: (frame: OmokServerFrame) => {
        if (frame.type === "command_committed" || frame.type === "command_rejected") {
          clearAckTimer();
        }
        const effects = apply(applyServerFrame(stateRef.current, frame));
        if (frame.type === "command_rejected" && !effects.length) {
          apply(setError(stateRef.current, omokRejectionMessage(frame.error)));
        }
        void runEffects(effects);
      },
    });
    socketRef.current = client;
    const listener = AppState.addEventListener("change", (status) =>
      client.setActive(status === "active"),
    );
    return () => {
      listener.remove();
      client.dispose();
      if (socketRef.current === client) socketRef.current = null;
    };
  }, [apply, clearAckTimer, onUnauthorized, runEffects, sessionId]);

  /** Bounded HTTP recovery. The 3s active-game poll runs only while the game
   * socket is not healthy. */
  useEffect(() => {
    if (!shouldPollActiveOmokGame(socketStatus, state.snapshot?.roomStatus ?? null)) return;
    const timer = setInterval(() => void refresh(), OMOK_ACTIVE_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh, socketStatus, state.snapshot?.roomStatus]);

  useEffect(() => {
    void (async () => {
      if (!migratedRef.current) {
        migratedRef.current = true;
        await migrateLegacyPendingOmokCommand(boardId).catch(() => undefined);
      }
      await refresh();
    })();
  }, [boardId, refresh]);

  /** Replay a durable pending command once per session, after authority is known. */
  useEffect(() => {
    if (!sessionId || state.pending || busy) return;
    let cancelled = false;
    void (async () => {
      for (const commandType of ["place_stone", "resign", "ready"] as const) {
        const pending = await loadPendingOmokCommand(sessionId, commandType);
        if (cancelled || !pending) continue;
        const key = `${sessionId}:${pending.request.requestId}`;
        if (adoptedRef.current === key) continue;
        adoptedRef.current = key;
        if (!lockRef.current.acquire()) return;
        const effects = apply(adoptPending(stateRef.current, { ...pending, stone: null, phase: "confirming" }));
        if (!effects.length) lockRef.current.release();
        await runEffects(effects);
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply, busy, runEffects, sessionId, state.pending]);

  useEffect(() => clearAckTimer, [clearAckTimer]);

  const aim = useCallback(
    (position: OmokAim) => apply(aimAt(stateRef.current, position)),
    [apply],
  );
  const cancelAim = useCallback(() => apply(clearAim(stateRef.current)), [apply]);

  /** The lock is taken synchronously, before any state or async work, so two
   * confirms in one JS frame cannot both submit. */
  const confirm = useCallback(() => {
    if (!lockRef.current.acquire()) return;
    const effects = apply(confirmAim(stateRef.current, makeOmokCommand));
    if (!effects.length) {
      lockRef.current.release();
      return;
    }
    void runEffects(effects);
  }, [apply, runEffects]);

  const sendIntent = useCallback(
    (command: Exclude<OmokIntent, { type: "place_stone" }>) => {
      if (!lockRef.current.acquire()) return;
      const effects = apply(startIntent(stateRef.current, command, makeOmokCommand));
      if (!effects.length) {
        lockRef.current.release();
        return;
      }
      void runEffects(effects);
    },
    [apply, runEffects],
  );

  const rematch = useCallback(() => {
    const snapshot = stateRef.current.snapshot;
    if (!snapshot?.viewer.capabilities.canRematch || !lockRef.current.acquire()) return;
    setBusy(true);
    void (async () => {
      try {
        const replacement = await requestOmokRematch(
          snapshot.sessionId,
          makeOmokCommand(snapshot, { type: "ready" }).requestId,
        );
        ingest(replacement, true);
      } catch (cause) {
        apply(setError(stateRef.current, omokHttpErrorMessage(cause)));
      } finally {
        lockRef.current.release();
        setBusy(false);
      }
    })();
  }, [apply, ingest]);

  return useMemo(
    () => ({
      state,
      loading,
      busy,
      socketStatus,
      offline,
      refresh,
      aim,
      cancelAim,
      confirm,
      sendIntent,
      rematch,
    }),
    [
      aim,
      busy,
      cancelAim,
      confirm,
      loading,
      offline,
      refresh,
      rematch,
      sendIntent,
      socketStatus,
      state,
    ],
  );
}

export function shouldRetryOmokRealtimeTicketError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.status === 0 || error.status === 408 || error.status >= 500;
}

function omokRealtimeTicketErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return "대국 정보를 확인할 수 없어요. 화면을 새로고침해 주세요.";
  }
  return "실시간 게임 연결 정보를 확인하지 못했어요. 화면을 다시 열어 주세요.";
}

export function omokHttpErrorMessage(error: unknown): string {
  const body = playApiError(error);
  switch (body?.error) {
    case "invalid_phase":
      return "지금 단계에서는 그 동작을 할 수 없어요.";
    case "domain_rejected":
      return "그 자리는 둘 수 없거나 내 차례가 아니에요.";
    case "forbidden":
      return "이 대국에 참여할 권한이 없어요.";
    case "play_engine_unavailable":
      return "게임 서버 연결이 불안정해요. 잠시 후 다시 시도할 수 있어요.";
    case "match_creation_failed":
    case "match_reservation_failed":
      return "대국을 만들지 못했어요. 잠시 후 다시 시도해 주세요.";
    default:
      return "연결을 확인해 주세요. 미확인 요청은 안전하게 다시 보낼 수 있어요.";
  }
}
