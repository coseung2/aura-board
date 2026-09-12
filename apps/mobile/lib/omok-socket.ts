import {
  OMOK_PROTOCOL_VERSION,
  parseOmokServerFrame,
  type OmokClientFrame,
  type OmokServerFrame,
} from "./omok-protocol";
import type { OmokRealtimeTransport } from "./omok-contract";
export { OMOK_ACTIVE_POLL_INTERVAL_MS } from "./omok-contract";

/** Rust game-socket health, tracked independently of Supabase board realtime.
 * `degraded` is terminal for this client instance: the bounded handshake budget
 * was spent without ever reaching ready, so the reconnect timer is stopped and
 * HTTP recovery is the only channel until foreground or session reset. */
export type OmokSocketStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "http"
  | "degraded"
  | "unavailable";

/** The 3s active-game HTTP poll only stops while the game socket is healthy.
 * Every other state keeps bounded HTTP recovery running. */
export function shouldPollActiveOmokGame(
  status: OmokSocketStatus,
  roomStatus: "waiting" | "ready" | "active" | "finished" | null,
): boolean {
  if (!roomStatus || roomStatus === "finished") return false;
  // Only a first-frame-authenticated ready socket can deliver authoritative
  // state for every live room phase. All other states retain HTTP recovery.
  return status !== "ready";
}

export const OMOK_ACK_TIMEOUT_MS = 4_000;
const AUTH_TIMEOUT_MS = 5_000;
const BASE_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 15_000;

/**
 * The installed React Native Android WebSocketModule adds an Origin header
 * derived from the URL whenever the caller omits one, so `ws://127.0.0.1:8788`
 * would present `http://127.0.0.1:8788` — a value the server cannot allowlist
 * without also trusting same-origin browser pages. Every connection therefore
 * sends this fixed sentinel instead, which no browser can forge.
 */
export const OMOK_CLIENT_ORIGIN = "https://mobile.aura-board.invalid";

/** Total connection attempts allowed before ready in one bounded cycle. */
export const OMOK_MAX_HANDSHAKE_ATTEMPTS = 6;

/** Server closed this socket because the same actor opened a newer one. */
export const OMOK_CLOSE_REPLACED = 4001;
/** Server rejected this socket as a late attempt losing to a newer one. */
export const OMOK_CLOSE_STALE_ATTEMPT = 4002;

export type OmokSocketCloseEvent = { code?: number | null; reason?: string | null };

export type OmokSocketLike = {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  /** Close code and reason drive terminal classification, so they are part of
   * the injectable transport shape rather than being discarded. */
  onclose: ((event: OmokSocketCloseEvent) => void) | null;
};

export type OmokSocketConnectOptions = { headers: { origin: string } };

/** RN's 3-arg constructor, narrowed here so the DOM `WebSocket` type mismatch
 * is cast in exactly one place instead of at the call site. */
type OmokWebSocketConstructor = new (
  url: string,
  protocols: string[] | undefined,
  options: OmokSocketConnectOptions,
) => OmokSocketLike;

export type OmokConnect = (
  url: string,
  protocols: string[] | undefined,
  options: OmokSocketConnectOptions,
) => OmokSocketLike;

/**
 * Builds the production connector. The global `WebSocket` is typed as the DOM
 * constructor, which declares neither the third options argument nor a close
 * code on `onclose`; this helper is the single narrow bridge to RN's real
 * runtime shape.
 */
export function createNativeOmokConnect(
  ctor: unknown = (globalThis as { WebSocket?: unknown }).WebSocket,
): OmokConnect {
  const Ctor = ctor as OmokWebSocketConstructor;
  return (url, protocols, options) => new Ctor(url, protocols, options);
}

export type OmokSocketOptions = {
  /** Fetches a short-lived session-bound ticket immediately before connecting. */
  requestTicket: () => Promise<OmokRealtimeTransport>;
  /** Terminal auth or protocol failures must not create a reconnect loop. */
  shouldRetryTicketError?: (error: unknown) => boolean;
  connect: OmokConnect;
  onFrame: (frame: OmokServerFrame) => void;
  onStatus: (status: OmokSocketStatus) => void;
  /** Latest applied authoritative version, sent for reconnect catch-up. */
  lastSeenVersion: () => number | null;
  setTimer?: (handler: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/**
 * Ticket -> connect -> authenticate -> ready lifecycle with bounded backoff.
 * Transport is injectable so reconnect, auth timeout, and command queueing are
 * exercised with fake sockets and clocks in the node test environment.
 */
export function createOmokSocket({
  requestTicket,
  shouldRetryTicketError = () => true,
  connect,
  onFrame,
  onStatus,
  lastSeenVersion,
  setTimer = (handler, ms) => setTimeout(handler, ms),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: OmokSocketOptions) {
  let disposed = false;
  let active = true;
  let status: OmokSocketStatus = "idle";
  let socket: OmokSocketLike | null = null;
  let connectingGeneration: number | null = null;
  let generation = 0;
  let failures = 0;
  let reconnectHandle: unknown = null;
  let authHandle: unknown = null;
  /** Attempts in the current bounded cycle that never reached ready. */
  let handshakeAttempts = 0;
  /** Set once this client instance must never reconnect on its own again:
   * server-side replacement, a stale-attempt rejection, a non-retryable
   * connection_error, a terminal ticket failure, or a spent handshake budget. */
  let terminal = false;
  /** True while the current cycle has reached ready. A close after ready starts
   * a brand-new bounded cycle instead of exempting the client from the bound,
   * so a flapping connection cannot retry forever. */
  let everReady = false;

  function updateStatus(next: OmokSocketStatus) {
    if (disposed || status === next) return;
    status = next;
    onStatus(next);
  }

  function clearAuthTimer() {
    if (authHandle !== null) clearTimer(authHandle);
    authHandle = null;
  }

  function clearReconnectTimer() {
    if (reconnectHandle !== null) clearTimer(reconnectHandle);
    reconnectHandle = null;
  }

  function teardown(code?: number, reason?: string) {
    clearAuthTimer();
    const current = socket;
    socket = null;
    if (current) {
      current.onopen = null;
      current.onmessage = null;
      current.onerror = null;
      current.onclose = null;
      try {
        if (code === undefined) current.close();
        else current.close(code, reason);
      } catch {
        /* already closed */
      }
    }
  }

  /** Stops this client instance permanently until foreground or reset rearms it. */
  function goTerminal(next: OmokSocketStatus) {
    terminal = true;
    clearReconnectTimer();
    teardown();
    updateStatus(next);
  }

  /** Begins a fresh bounded cycle. Called on foreground and session reset. */
  function rearm() {
    generation += 1;
    // An older ticket request cannot be cancelled, but it no longer owns the
    // connecting slot and its eventual result is ignored by the generation
    // checks in open().
    connectingGeneration = null;
    terminal = false;
    handshakeAttempts = 0;
    everReady = false;
    failures = 0;
  }

  function scheduleReconnect() {
    if (
      disposed ||
      !active ||
      terminal ||
      reconnectHandle !== null ||
      socket ||
      connectingGeneration !== null
    ) {
      return;
    }
    // The handshake budget only governs attempts that never reached ready. A
    // 403 Upgrade is invisible to RN, so this bound is what stops the endless
    // fresh-ticket ladder that HTTP recovery would otherwise hide forever.
    // `fail` already reset the counter when the cycle had reached ready.
    if (handshakeAttempts >= OMOK_MAX_HANDSHAKE_ATTEMPTS) {
      goTerminal("degraded");
      return;
    }
    const delay = Math.min(MAX_RECONNECT_MS, BASE_RECONNECT_MS * 2 ** Math.min(failures, 4));
    failures += 1;
    reconnectHandle = setTimer(() => {
      reconnectHandle = null;
      void open();
    }, delay);
  }

  function fail() {
    teardown();
    if (terminal) return;
    // A close that follows a healthy ready is a transient transport event, not
    // a handshake rejection. It opens a fresh bounded cycle from zero.
    if (everReady) {
      everReady = false;
      handshakeAttempts = 0;
      failures = 0;
    }
    updateStatus("unavailable");
    scheduleReconnect();
  }

  async function open() {
    if (disposed || !active || terminal || socket || connectingGeneration !== null) return;
    const attemptGeneration = generation;
    connectingGeneration = attemptGeneration;
    updateStatus("connecting");
    // Counted per attempt rather than per opened socket: a retryable ticket
    // failure is also a pre-ready attempt, and leaving it uncounted would keep
    // a second unbounded ladder alive.
    handshakeAttempts += 1;
    try {
      // A ticket lives ~30s and is single-use per connection, so it is fetched
      // per attempt and never cached.
      const issued = await requestTicket();
      if (
        disposed ||
        !active ||
        terminal ||
        generation !== attemptGeneration ||
        connectingGeneration !== attemptGeneration
      ) {
        return;
      }
      if (issued.transport === "http") {
        failures = 0;
        handshakeAttempts = 0;
        // An explicit bot HTTP transport is a routing answer, not a handshake
        // failure, so it must not consume the budget.
        updateStatus("http");
        return;
      }
      const next = connect(issued.websocketUrl, undefined, {
        headers: { origin: OMOK_CLIENT_ORIGIN },
      });
      socket = next;
      next.onopen = () => {
        send({
          type: "authenticate",
          protocolVersion: OMOK_PROTOCOL_VERSION,
          ticket: issued.ticket,
          lastSeenVersion: lastSeenVersion(),
        });
        clearAuthTimer();
        authHandle = setTimer(() => {
          authHandle = null;
          if (status !== "ready") fail();
        }, AUTH_TIMEOUT_MS);
      };
      next.onmessage = (event) => {
        const frame = parseOmokServerFrame(event.data);
        if (!frame) return;
        if (frame.type === "ready") {
          clearAuthTimer();
          failures = 0;
          handshakeAttempts = 0;
          everReady = true;
          updateStatus("ready");
        }
        if (frame.type === "connection_error") {
          if (frame.retryable) {
            // Expired ticket and similar recoverable rejections: a fresh ticket
            // on the next attempt is exactly the fix.
            fail();
          } else {
            goTerminal("unavailable");
          }
          onFrame(frame);
          return;
        }
        onFrame(frame);
      };
      next.onerror = () => fail();
      next.onclose = (event) => {
        if (socket !== next) return;
        const code = event?.code ?? null;
        // Server-driven single-socket enforcement. Reconnecting here would
        // fight the replacement and ping-pong the two sockets.
        if (code === OMOK_CLOSE_REPLACED || code === OMOK_CLOSE_STALE_ATTEMPT) {
          goTerminal("unavailable");
          return;
        }
        fail();
      };
    } catch (error) {
      if (
        disposed ||
        !active ||
        terminal ||
        generation !== attemptGeneration ||
        connectingGeneration !== attemptGeneration
      ) {
        return;
      }
      // Ticket failures happen while this generation owns the connecting
      // slot. Release it before scheduling the next bounded attempt.
      connectingGeneration = null;
      if (shouldRetryTicketError(error)) {
        fail();
      } else {
        goTerminal("unavailable");
      }
    } finally {
      if (connectingGeneration === attemptGeneration) {
        connectingGeneration = null;
      }
    }
  }

  function send(frame: OmokClientFrame): boolean {
    if (!socket) return false;
    try {
      socket.send(JSON.stringify(frame));
      return true;
    } catch {
      fail();
      return false;
    }
  }

  void open();

  return {
    getStatus: () => status,
    /** Attempts spent in the current pre-ready cycle. Exposed for diagnostics
     * and tests; callers must not branch product behavior on it. */
    getHandshakeAttempts: () => handshakeAttempts,
    /** Returns false when the caller must fall back to the HTTP command path. */
    sendCommand(frame: OmokClientFrame): boolean {
      return status === "ready" && send(frame);
    },
    setActive(next: boolean) {
      if (disposed || next === active) return;
      active = next;
      if (active) {
        // Returning to foreground is fresh user intent: a degraded or otherwise
        // terminal instance gets a brand-new bounded cycle.
        rearm();
        void open();
      } else {
        clearReconnectTimer();
        teardown();
        updateStatus("idle");
      }
    },
    /** Force a fresh ticket and connection, e.g. after session replacement. */
    reset() {
      if (disposed) return;
      clearReconnectTimer();
      rearm();
      teardown();
      updateStatus("idle");
      void open();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearReconnectTimer();
      teardown();
    },
  };
}
