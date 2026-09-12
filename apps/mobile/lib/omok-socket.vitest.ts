import { describe, expect, it, vi } from "vitest";
import {
  OMOK_ACTIVE_POLL_INTERVAL_MS,
  OMOK_CLIENT_ORIGIN,
  OMOK_CLOSE_REPLACED,
  OMOK_CLOSE_STALE_ATTEMPT,
  OMOK_MAX_HANDSHAKE_ATTEMPTS,
  createNativeOmokConnect,
  createOmokSocket,
  shouldPollActiveOmokGame,
  type OmokSocketConnectOptions,
  type OmokSocketLike,
  type OmokSocketStatus,
} from "./omok-socket";
import { OMOK_MAX_FRAME_BYTES } from "./omok-protocol";
import {
  parseOmokRealtimeTransport,
  type OmokRealtimeTransport,
  type OmokSnapshot,
} from "./omok-contract";

function snapshot(version = 4): OmokSnapshot {
  return {
    sessionId: "session-a",
    boardId: "board-1",
    gameKind: "omok",
    version,
    serverTimeMs: 1_000,
    rulesVersion: 1,
    stateSchemaVersion: 1,
    previousSessionId: null,
    roomStatus: "active",
    participants: [
      { displayName: "test", slot: "first", ready: true },
      { displayName: "공서희", slot: "second", ready: true },
    ],
    viewer: { role: "participant", slot: "first", capabilities: { canRematch: false } },
    game: {
      board: Array(225).fill(null),
      nextTurn: "first",
      status: { status: "playing" },
      moveCount: 0,
      lastMove: null,
    },
    outcome: null,
  };
}

function fakeSocket() {
  const sent: string[] = [];
  let closedWith: { code?: number; reason?: string } | null = null;
  const socket: OmokSocketLike = {
    send: (data) => void sent.push(data),
    close: (code, reason) => {
      closedWith = { code, reason };
    },
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
  };
  return { socket, sent, closed: () => closedWith };
}

/**
 * Fake clock with real cancellation. The previous harness ignored `clearTimer`
 * and never removed entries, so "no reconnect is scheduled" and "the retry
 * timer stopped" were both unprovable — a cleared timer looked identical to a
 * live one. Pending timers are now tracked by identity and removed on clear.
 */
function fakeClock() {
  type Entry = { id: number; handler: () => void; ms: number };
  const pending = new Map<number, Entry>();
  const scheduled: Entry[] = [];
  let nextId = 1;
  return {
    /** Every timer ever scheduled, including cleared and fired ones. */
    scheduled,
    /** Only timers that are still live right now. */
    pending: () => [...pending.values()],
    pendingAt: (ms: number) => [...pending.values()].filter((entry) => entry.ms === ms),
    setTimer(handler: () => void, ms: number) {
      const entry = { id: nextId++, handler, ms };
      pending.set(entry.id, entry);
      scheduled.push(entry);
      return entry.id;
    },
    clearTimer(handle: unknown) {
      pending.delete(handle as number);
    },
    /** Fires a live timer and removes it, like a real one-shot timeout. */
    fire(entry: { id: number; handler: () => void }) {
      if (!pending.has(entry.id)) {
        throw new Error(`timer ${entry.id} was cleared and cannot fire`);
      }
      pending.delete(entry.id);
      entry.handler();
    },
    /** Fires the newest live reconnect timer, i.e. anything not the auth timer. */
    fireReconnect() {
      const entry = [...pending.values()].filter((item) => item.ms !== 5_000).at(-1);
      if (!entry) throw new Error("no reconnect timer is pending");
      pending.delete(entry.id);
      entry.handler();
    },
  };
}

function harness(options: {
  ticket?: () => Promise<OmokRealtimeTransport>;
  shouldRetryTicketError?: (error: unknown) => boolean;
} = {}) {
  const created: ReturnType<typeof fakeSocket>[] = [];
  const statuses: OmokSocketStatus[] = [];
  const frames: unknown[] = [];
  const connectArgs: Array<{
    url: string;
    protocols: string[] | undefined;
    options: OmokSocketConnectOptions;
  }> = [];
  const clock = fakeClock();
  const client = createOmokSocket({
    requestTicket: options.ticket ?? (async () => ({
      transport: "websocket",
      protocolVersion: 1,
      websocketUrl: "wss://engine/ws",
      ticket: "t-1",
      expiresAtMs: 30_000,
    })),
    shouldRetryTicketError: options.shouldRetryTicketError,
    connect: (url, protocols, connectOptions) => {
      connectArgs.push({ url, protocols, options: connectOptions });
      const next = fakeSocket();
      created.push(next);
      return next.socket;
    },
    onFrame: (frame) => void frames.push(frame),
    onStatus: (status) => void statuses.push(status),
    lastSeenVersion: () => 4,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  return { client, created, statuses, frames, connectArgs, clock, timers: clock.scheduled };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

const readyFrame = JSON.stringify({
  type: "ready",
  protocolVersion: 1,
  sessionId: "session-a",
  snapshot: snapshot(),
});

/**
 * Closes the newest socket the way an unclassifiable Upgrade rejection appears
 * to RN — no code, no server frame — then runs the scheduled backoff so the
 * next attempt happens.
 */
async function failHandshakeAndRetry(h: ReturnType<typeof harness>) {
  h.created.at(-1)!.socket.onclose?.({ code: 1006 });
  h.clock.fireReconnect();
  await flush();
}

describe("active-game poll policy", () => {
  it("polls unless the Rust game socket is ready", () => {
    for (const roomStatus of ["waiting", "ready", "active"] as const) {
      expect(shouldPollActiveOmokGame("ready", roomStatus)).toBe(false);
      for (const status of ["idle", "connecting", "http", "degraded", "unavailable"] as const) {
        expect(shouldPollActiveOmokGame(status, roomStatus)).toBe(true);
      }
    }
    expect(shouldPollActiveOmokGame("idle", null)).toBe(false);
    expect(shouldPollActiveOmokGame("unavailable", "finished")).toBe(false);
    expect(OMOK_ACTIVE_POLL_INTERVAL_MS).toBe(3_000);
  });

  it("keeps HTTP recovery running in degraded and stops only for ready", () => {
    // Only an authenticated ready socket may silence polling.
    for (const roomStatus of ["waiting", "ready", "active"] as const) {
      expect(shouldPollActiveOmokGame("degraded", roomStatus)).toBe(true);
      expect(shouldPollActiveOmokGame("ready", roomStatus)).toBe(false);
    }
    // A finished room stops polling regardless of transport health.
    expect(shouldPollActiveOmokGame("degraded", "finished")).toBe(false);
    expect(shouldPollActiveOmokGame("degraded", null)).toBe(false);
  });
});

describe("omok socket lifecycle", () => {
  it("authenticates on open with the catch-up version and reports ready", async () => {
    const { client, created, statuses } = harness();
    await flush();
    created[0].socket.onopen?.();

    expect(JSON.parse(created[0].sent[0])).toEqual({
      type: "authenticate",
      protocolVersion: 1,
      ticket: "t-1",
      lastSeenVersion: 4,
    });
    expect(client.getStatus()).toBe("connecting");

    created[0].socket.onmessage?.({
      data: JSON.stringify({
        type: "ready",
        protocolVersion: 1,
        sessionId: "session-a",
        snapshot: snapshot(),
      }),
    });
    expect(client.getStatus()).toBe("ready");
    expect(statuses).toContain("ready");
  });

  it("refuses to send a command until ready, so the caller uses HTTP", async () => {
    const { client, created } = harness();
    await flush();
    created[0].socket.onopen?.();

    const frame = {
      type: "command" as const,
      protocolVersion: 1 as const,
      requestId: "place_stone.a",
      expectedVersion: 4,
      commandSchemaVersion: 1 as const,
      command: { type: "place_stone" as const, position: { row: 7, column: 7 } },
    };
    expect(client.sendCommand(frame)).toBe(false);

    created[0].socket.onmessage?.({
      data: JSON.stringify({ type: "ready", protocolVersion: 1, sessionId: "session-a", snapshot: snapshot() }),
    });
    expect(client.sendCommand(frame)).toBe(true);
    expect(JSON.parse(created[0].sent[1]).requestId).toBe("place_stone.a");
  });

  it("marks the socket unavailable and schedules retry when ticket issuance fails", async () => {
    const { client, clock } = harness({ ticket: async () => { throw new Error("ticket failed"); } });
    await flush();
    expect(client.getStatus()).toBe("unavailable");
    expect(clock.pending()).toEqual([{ id: expect.any(Number), handler: expect.any(Function), ms: 1_000 }]);
    expect(shouldPollActiveOmokGame(client.getStatus(), "active")).toBe(true);
  });

  it("does not reconnect after a terminal ticket authorization failure", async () => {
    const authorizationError = new Error("forbidden");
    const { client, created, clock } = harness({
      ticket: async () => { throw authorizationError; },
      shouldRetryTicketError: (error) => error !== authorizationError,
    });
    await flush();

    expect(client.getStatus()).toBe("unavailable");
    expect(created).toHaveLength(0);
    expect(clock.pending()).toHaveLength(0);
  });

  it("uses explicit bot HTTP transport without opening a socket", async () => {
    const { client, created } = harness({
      ticket: async () => ({
        transport: "http",
        reason: "bot_session",
        pollIntervalMs: 3_000,
      }),
    });
    await flush();
    expect(client.getStatus()).toBe("http");
    expect(created).toHaveLength(0);
  });

  it("requests a fresh ticket on every reconnect attempt", async () => {
    const tickets = vi.fn(async () => ({
      transport: "websocket" as const,
      protocolVersion: 1 as const,
      websocketUrl: "wss://engine/ws",
      ticket: "t-1",
      expiresAtMs: 30_000,
    }));
    const { client, created, clock } = harness({ ticket: tickets });
    await flush();
    created[0].socket.onopen?.();
    created[0].socket.onmessage?.({ data: readyFrame });

    created[0].socket.onclose?.({ code: 1006 });
    expect(client.getStatus()).toBe("unavailable");

    clock.fireReconnect();
    await flush();
    expect(tickets).toHaveBeenCalledTimes(2);
    expect(created).toHaveLength(2);
  });

  it("fails the connection when authentication never completes", async () => {
    const { client, created, clock } = harness();
    await flush();
    created[0].socket.onopen?.();

    clock.fire(clock.pendingAt(5_000)[0]!);
    expect(client.getStatus()).toBe("unavailable");
  });

  it("stops retrying a non-retriable connection error", async () => {
    const { client, created, frames } = harness();
    await flush();
    created[0].socket.onopen?.();
    created[0].socket.onmessage?.({
      data: JSON.stringify({
        type: "connection_error",
        protocolVersion: 1,
        error: "forbidden",
        retryable: false,
      }),
    });

    expect(client.getStatus()).toBe("unavailable");
    expect(frames).toEqual([
      { type: "connection_error", protocolVersion: 1, error: "forbidden", retryable: false },
    ]);
  });

  it("drops malformed and oversized frames instead of surfacing them", async () => {
    const { created, frames } = harness();
    await flush();
    created[0].socket.onopen?.();

    created[0].socket.onmessage?.({ data: "}{" });
    created[0].socket.onmessage?.({ data: "x".repeat(OMOK_MAX_FRAME_BYTES + 1) });
    created[0].socket.onmessage?.({ data: JSON.stringify({ type: "snapshot", protocolVersion: 9 }) });
    expect(frames).toHaveLength(0);
  });

  it("suspends in the background and reconnects on foreground", async () => {
    const { client, created } = harness();
    await flush();
    created[0].socket.onopen?.();
    created[0].socket.onmessage?.({ data: readyFrame });

    client.setActive(false);
    expect(client.getStatus()).toBe("idle");

    client.setActive(true);
    await flush();
    expect(created).toHaveLength(2);
  });

  it("re-tickets from scratch after a session replacement reset", async () => {
    const { client, created } = harness();
    await flush();
    created[0].socket.onopen?.();
    created[0].socket.onmessage?.({ data: readyFrame });

    client.reset();
    await flush();
    expect(created).toHaveLength(2);
    expect(client.getStatus()).toBe("connecting");
  });

  it("ignores an in-flight pre-foreground ticket and starts exactly one fresh attempt", async () => {
    let resolveOld!: (value: OmokRealtimeTransport) => void;
    const oldTicket = new Promise<OmokRealtimeTransport>((resolve) => {
      resolveOld = resolve;
    });
    const tickets = vi
      .fn<() => Promise<OmokRealtimeTransport>>()
      .mockImplementationOnce(() => oldTicket)
      .mockResolvedValue({
        transport: "websocket",
        protocolVersion: 1,
        websocketUrl: "wss://engine/ws",
        ticket: "fresh-after-foreground",
        expiresAtMs: 30_000,
      });
    const h = harness({ ticket: tickets });
    await flush();

    h.client.setActive(false);
    h.client.setActive(true);
    await flush();
    expect(tickets).toHaveBeenCalledTimes(2);
    expect(h.created).toHaveLength(1);

    resolveOld({
      transport: "websocket",
      protocolVersion: 1,
      websocketUrl: "wss://stale/ws",
      ticket: "stale-before-foreground",
      expiresAtMs: 30_000,
    });
    await flush();
    expect(h.created).toHaveLength(1);
    expect(h.clock.pending()).toHaveLength(0);
    h.created[0].socket.onopen?.();
    expect(JSON.parse(h.created[0].sent[0]).ticket).toBe("fresh-after-foreground");
  });

  it("ignores an in-flight ticket rejection across reset without clearing the fresh attempt", async () => {
    let rejectOld!: (reason: unknown) => void;
    const oldTicket = new Promise<OmokRealtimeTransport>((_resolve, reject) => {
      rejectOld = reject;
    });
    const tickets = vi
      .fn<() => Promise<OmokRealtimeTransport>>()
      .mockImplementationOnce(() => oldTicket)
      .mockResolvedValue({
        transport: "websocket",
        protocolVersion: 1,
        websocketUrl: "wss://engine/ws",
        ticket: "fresh-after-reset",
        expiresAtMs: 30_000,
      });
    const h = harness({ ticket: tickets });
    await flush();

    h.client.reset();
    await flush();
    expect(tickets).toHaveBeenCalledTimes(2);
    expect(h.created).toHaveLength(1);

    rejectOld(new Error("stale ticket failure"));
    await flush();
    expect(h.created).toHaveLength(1);
    expect(h.clock.pending()).toHaveLength(0);
    h.created[0].socket.onopen?.();
    expect(JSON.parse(h.created[0].sent[0]).ticket).toBe("fresh-after-reset");
  });
});

describe("explicit connection origin", () => {
  it("always sends the fixed sentinel origin instead of a URL-derived one", async () => {
    const { connectArgs } = harness();
    await flush();

    expect(connectArgs).toHaveLength(1);
    expect(connectArgs[0].url).toBe("wss://engine/ws");
    expect(connectArgs[0].options).toEqual({
      headers: { origin: "https://mobile.aura-board.invalid" },
    });
    expect(OMOK_CLIENT_ORIGIN).toBe("https://mobile.aura-board.invalid");
    // The native module only derives an Origin when the caller omits one, so
    // the header must be present on every attempt, reconnects included.
    expect(connectArgs[0].options.headers.origin).not.toContain("engine");
  });

  it("reuses the same origin on reconnect attempts", async () => {
    const h = harness();
    await flush();
    await failHandshakeAndRetry(h);

    expect(h.connectArgs).toHaveLength(2);
    for (const call of h.connectArgs) {
      expect(call.options.headers.origin).toBe(OMOK_CLIENT_ORIGIN);
    }
  });

  it("passes url, protocols and options through the narrow native constructor", () => {
    const calls: unknown[][] = [];
    class FakeWebSocket {
      constructor(...args: unknown[]) {
        calls.push(args);
      }
    }
    const connect = createNativeOmokConnect(FakeWebSocket);
    connect("wss://engine/ws", undefined, { headers: { origin: OMOK_CLIENT_ORIGIN } });

    expect(calls).toEqual([
      ["wss://engine/ws", undefined, { headers: { origin: OMOK_CLIENT_ORIGIN } }],
    ]);
  });
});

describe("bounded handshake budget", () => {
  it("gives up after exactly six pre-ready attempts and stops the retry timer", async () => {
    const h = harness();
    await flush();
    expect(OMOK_MAX_HANDSHAKE_ATTEMPTS).toBe(6);

    // Attempts 1..5 each fail before ready and schedule the next attempt.
    for (let attempt = 1; attempt < OMOK_MAX_HANDSHAKE_ATTEMPTS; attempt += 1) {
      expect(h.created).toHaveLength(attempt);
      expect(h.client.getStatus()).toBe("connecting");
      await failHandshakeAndRetry(h);
    }

    // The sixth attempt exists and is the last one allowed.
    expect(h.created).toHaveLength(OMOK_MAX_HANDSHAKE_ATTEMPTS);
    h.created.at(-1)!.socket.onclose?.({ code: 1006 });

    expect(h.client.getStatus()).toBe("degraded");
    expect(h.created).toHaveLength(OMOK_MAX_HANDSHAKE_ATTEMPTS);
    // No reconnect timer may remain: this is the loop the outage was hiding.
    expect(h.clock.pending()).toHaveLength(0);
    // HTTP recovery keeps covering the game.
    expect(shouldPollActiveOmokGame(h.client.getStatus(), "active")).toBe(true);
  });

  it("follows the bounded backoff ladder while spending the budget", async () => {
    const h = harness();
    await flush();
    for (let attempt = 1; attempt < OMOK_MAX_HANDSHAKE_ATTEMPTS; attempt += 1) {
      await failHandshakeAndRetry(h);
    }

    const delays = h.clock.scheduled.filter((entry) => entry.ms !== 5_000).map((entry) => entry.ms);
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 15_000]);
  });

  it("counts retryable ticket failures against the same budget", async () => {
    // Without this, a 5xx ticket loop would be a second unbounded ladder.
    const h = harness({ ticket: async () => { throw new Error("boom"); } });
    await flush();
    for (let attempt = 1; attempt < OMOK_MAX_HANDSHAKE_ATTEMPTS; attempt += 1) {
      expect(h.client.getStatus()).toBe("unavailable");
      h.clock.fireReconnect();
      await flush();
    }

    expect(h.client.getStatus()).toBe("degraded");
    expect(h.clock.pending()).toHaveLength(0);
  });

  it("starts a new bounded cycle after a transient close that follows ready", async () => {
    const h = harness();
    await flush();
    h.created[0].socket.onopen?.();
    h.created[0].socket.onmessage?.({ data: readyFrame });
    expect(h.client.getStatus()).toBe("ready");
    expect(h.client.getHandshakeAttempts()).toBe(0);

    // A network blip after ready is not a handshake rejection, so the budget is
    // spent from zero again rather than inheriting earlier failures.
    h.created[0].socket.onclose?.({ code: 1006 });
    expect(h.client.getStatus()).toBe("unavailable");
    expect(h.clock.pending()).toHaveLength(1);

    h.clock.fireReconnect();
    await flush();
    h.created[1].socket.onopen?.();
    h.created[1].socket.onmessage?.({ data: readyFrame });
    expect(h.client.getStatus()).toBe("ready");

    // And it can still exhaust a fresh full cycle later without going degraded early.
    h.created[1].socket.onclose?.({ code: 1006 });
    // Each iteration opens one attempt and fails it, so the full budget takes
    // six iterations here: unlike the first cycle, no attempt is open yet.
    for (let attempt = 1; attempt <= OMOK_MAX_HANDSHAKE_ATTEMPTS; attempt += 1) {
      expect(h.client.getStatus()).toBe("unavailable");
      h.clock.fireReconnect();
      await flush();
      expect(h.client.getHandshakeAttempts()).toBe(attempt);
      h.created.at(-1)!.socket.onclose?.({ code: 1006 });
    }
    expect(h.client.getStatus()).toBe("degraded");
    expect(h.clock.pending()).toHaveLength(0);
  });
});

describe("terminal close codes and connection errors", () => {
  it("never reconnects after the server replaces this socket", async () => {
    const h = harness();
    await flush();
    h.created[0].socket.onopen?.();
    h.created[0].socket.onmessage?.({ data: readyFrame });

    h.created[0].socket.onclose?.({ code: OMOK_CLOSE_REPLACED, reason: "replaced" });

    expect(OMOK_CLOSE_REPLACED).toBe(4001);
    expect(h.client.getStatus()).toBe("unavailable");
    expect(h.created).toHaveLength(1);
    expect(h.clock.pending()).toHaveLength(0);
  });

  it("never reconnects after being rejected as a stale attempt", async () => {
    const h = harness();
    await flush();
    h.created[0].socket.onclose?.({ code: OMOK_CLOSE_STALE_ATTEMPT, reason: "stale" });

    expect(OMOK_CLOSE_STALE_ATTEMPT).toBe(4002);
    expect(h.client.getStatus()).toBe("unavailable");
    expect(h.created).toHaveLength(1);
    expect(h.clock.pending()).toHaveLength(0);
  });

  it("reconnects with a fresh ticket for a retryable expired-ticket error", async () => {
    const tickets = vi.fn(async () => ({
      transport: "websocket" as const,
      protocolVersion: 1 as const,
      websocketUrl: "wss://engine/ws",
      ticket: "t-1",
      expiresAtMs: 30_000,
    }));
    const h = harness({ ticket: tickets });
    await flush();
    h.created[0].socket.onopen?.();
    h.created[0].socket.onmessage?.({
      data: JSON.stringify({
        type: "connection_error",
        protocolVersion: 1,
        error: "ticket_expired",
        retryable: true,
      }),
    });

    expect(h.client.getStatus()).toBe("unavailable");
    h.clock.fireReconnect();
    await flush();
    expect(tickets).toHaveBeenCalledTimes(2);
    expect(h.created).toHaveLength(2);
    expect(h.frames).toEqual([
      { type: "connection_error", protocolVersion: 1, error: "ticket_expired", retryable: true },
    ]);
  });

  it("does not reconnect for a non-retryable invalid ticket", async () => {
    const h = harness();
    await flush();
    h.created[0].socket.onopen?.();
    h.created[0].socket.onmessage?.({
      data: JSON.stringify({
        type: "connection_error",
        protocolVersion: 1,
        error: "ticket_invalid",
        retryable: false,
      }),
    });

    expect(h.client.getStatus()).toBe("unavailable");
    expect(h.created).toHaveLength(1);
    expect(h.clock.pending()).toHaveLength(0);
  });
});

describe("retry budget rearm", () => {
  it("rearms a degraded client when the app returns to the foreground", async () => {
    const h = harness();
    await flush();
    for (let attempt = 1; attempt < OMOK_MAX_HANDSHAKE_ATTEMPTS; attempt += 1) {
      await failHandshakeAndRetry(h);
    }
    h.created.at(-1)!.socket.onclose?.({ code: 1006 });
    expect(h.client.getStatus()).toBe("degraded");

    // Backgrounding then foregrounding is fresh user intent.
    h.client.setActive(false);
    h.client.setActive(true);
    await flush();

    expect(h.created).toHaveLength(OMOK_MAX_HANDSHAKE_ATTEMPTS + 1);
    expect(h.client.getStatus()).toBe("connecting");
  });

  it("rearms a degraded client on session reset", async () => {
    const h = harness();
    await flush();
    for (let attempt = 1; attempt < OMOK_MAX_HANDSHAKE_ATTEMPTS; attempt += 1) {
      await failHandshakeAndRetry(h);
    }
    h.created.at(-1)!.socket.onclose?.({ code: 1006 });
    expect(h.client.getStatus()).toBe("degraded");

    h.client.reset();
    await flush();

    expect(h.created).toHaveLength(OMOK_MAX_HANDSHAKE_ATTEMPTS + 1);
    expect(h.client.getStatus()).toBe("connecting");
    expect(h.client.getHandshakeAttempts()).toBe(1);
  });

  it("rearms after a terminal replacement close so a new cycle can connect", async () => {
    const h = harness();
    await flush();
    h.created[0].socket.onclose?.({ code: OMOK_CLOSE_REPLACED });
    expect(h.clock.pending()).toHaveLength(0);

    h.client.reset();
    await flush();
    expect(h.created).toHaveLength(2);
    expect(h.client.getStatus()).toBe("connecting");
  });
});

describe("realtime transport parsing", () => {
  it("accepts only the exact websocket or bot HTTP union", () => {
    expect(parseOmokRealtimeTransport({
      transport: "websocket",
      protocolVersion: 1,
      websocketUrl: "wss://engine.example/v1/realtime",
      ticket: "ticket",
      expiresAtMs: 30_000,
    })?.transport).toBe("websocket");
    expect(parseOmokRealtimeTransport({
      transport: "http",
      reason: "bot_session",
      pollIntervalMs: 3_000,
    })?.transport).toBe("http");
    expect(parseOmokRealtimeTransport({ url: "wss://engine", ticket: "legacy" })).toBeNull();
    expect(parseOmokRealtimeTransport({
      transport: "http",
      reason: "server_error",
      pollIntervalMs: 3_000,
    })).toBeNull();
  });
});
