import { describe, expect, it } from "vitest";
import {
  parseOmokSnapshot,
  parsePlayCommandResponse,
  type OmokSnapshot,
} from "./omok-contract";
import { parseOmokServerFrame } from "./omok-protocol";

function currentSnapshot(overrides: Partial<OmokSnapshot> = {}): OmokSnapshot {
  return {
    sessionId: "session-a",
    boardId: "board-1",
    gameKind: "omok",
    version: 4,
    serverTimeMs: 1_000,
    rulesVersion: 1,
    stateSchemaVersion: 1,
    previousSessionId: null,
    roomStatus: "active",
    participants: [
      { displayName: "첫째", slot: "first", ready: true },
      { displayName: "둘째", slot: "second", ready: true },
    ],
    viewer: {
      role: "participant",
      slot: "first",
      capabilities: { canRematch: false },
    },
    game: {
      board: Array<OmokSnapshot["game"]["board"][number]>(225).fill(null),
      nextTurn: "first",
      status: { status: "playing" },
      moveCount: 0,
      lastMove: null,
    },
    outcome: null,
    ...overrides,
  };
}

function withoutCapabilities(snapshot: OmokSnapshot): unknown {
  const { capabilities: _capabilities, ...viewer } = snapshot.viewer;
  return { ...snapshot, viewer };
}

describe("Omok rolling snapshot compatibility", () => {
  it("normalizes only the legacy omission without mutating its input", () => {
    const legacy = withoutCapabilities(currentSnapshot());
    const parsed = parseOmokSnapshot(legacy);

    expect(parsed?.viewer.capabilities).toEqual({ canRematch: false });
    expect((legacy as { viewer: object }).viewer).not.toHaveProperty("capabilities");
    expect(parsed).not.toBe(legacy);
  });

  it("preserves a strict current canRematch capability unchanged", () => {
    const current = currentSnapshot({
      viewer: { role: "host", slot: null, capabilities: { canRematch: true } },
    });

    const parsed = parseOmokSnapshot(current);
    expect(parsed).toBe(current);
    expect(parsed?.viewer.capabilities.canRematch).toBe(true);
  });

  it.each([
    ["null", null],
    ["partial", {}],
    ["malformed", { canRematch: "yes" }],
  ])("rejects %s capabilities instead of granting compatibility", (_label, capabilities) => {
    const malformed = currentSnapshot({
      viewer: {
        role: "participant",
        slot: "first",
        capabilities,
      } as unknown as OmokSnapshot["viewer"],
    });
    expect(parseOmokSnapshot(malformed)).toBeNull();
  });

  it("rejects other malformed fields even when legacy capabilities are omitted", () => {
    const malformed = withoutCapabilities(currentSnapshot({ boardId: "" }));
    expect(parseOmokSnapshot(malformed)).toBeNull();
  });

  it("normalizes a legacy HTTP command envelope and keeps version correlation strict", () => {
    const response = {
      requestId: "place_stone.1",
      previousVersion: 3,
      version: 4,
      snapshot: withoutCapabilities(currentSnapshot()),
    };

    expect(parsePlayCommandResponse(response)).toEqual({
      ...response,
      snapshot: expect.objectContaining({
        viewer: expect.objectContaining({ capabilities: { canRematch: false } }),
      }),
    });
    expect(parsePlayCommandResponse({ ...response, version: 5 })).toBeNull();
  });

  it("normalizes ready while retaining session correlation", () => {
    const frame = {
      type: "ready",
      protocolVersion: 1,
      sessionId: "session-a",
      snapshot: withoutCapabilities(currentSnapshot()),
    };

    const parsed = parseOmokServerFrame(frame);
    expect(parsed?.type).toBe("ready");
    if (!parsed || parsed.type !== "ready") throw new Error("missing ready frame");
    expect(parsed.snapshot.viewer.capabilities.canRematch).toBe(false);
    expect(parseOmokServerFrame({ ...frame, sessionId: "session-x" })).toBeNull();
  });

  it("normalizes command_rejected while retaining request and session checks", () => {
    const frame = {
      type: "command_rejected",
      protocolVersion: 1,
      sessionId: "session-a",
      requestId: "place_stone.1",
      commandType: "place_stone",
      error: "version_conflict",
      retryable: false,
      currentVersion: 4,
      snapshot: withoutCapabilities(currentSnapshot()),
    };

    const parsed = parseOmokServerFrame(frame);
    expect(parsed?.type).toBe("command_rejected");
    if (!parsed || parsed.type !== "command_rejected") throw new Error("missing rejection");
    expect(parsed.requestId).toBe("place_stone.1");
    expect(parsed.snapshot?.viewer.capabilities.canRematch).toBe(false);
    expect(parseOmokServerFrame({ ...frame, requestId: "" })).toBeNull();
    expect(parseOmokServerFrame({ ...frame, sessionId: "session-x" })).toBeNull();
  });

  it("normalizes session_replaced while retaining replacement correlation", () => {
    const replacement = currentSnapshot({
      sessionId: "session-b",
      previousSessionId: "session-a",
      version: 0,
    });
    const frame = {
      type: "session_replaced",
      protocolVersion: 1,
      reason: "rematch",
      previousSessionId: "session-a",
      sessionId: "session-b",
      snapshot: withoutCapabilities(replacement),
    };

    const parsed = parseOmokServerFrame(frame);
    expect(parsed?.type).toBe("session_replaced");
    if (!parsed || parsed.type !== "session_replaced") throw new Error("missing replacement");
    expect(parsed.snapshot.viewer.capabilities.canRematch).toBe(false);
    expect(parseOmokServerFrame({ ...frame, previousSessionId: "session-x" })).toBeNull();
  });
});
