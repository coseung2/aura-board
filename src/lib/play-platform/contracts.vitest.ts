import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCurrentOmokSession,
  makeOmokCommand,
  PlayClientError,
  submitOmokCommand,
} from "./browser-client";
import {
  isOmokSnapshot,
  isPlayCommandResponse,
  mergeOmokCommandSnapshot,
  OMOK_RULES_VERSION,
  PLAY_COMMAND_SCHEMA_VERSION,
  PLAY_SESSION_STATE_SCHEMA_VERSION,
  type OmokSnapshot,
} from "./contracts";

function snapshot(version = 7): OmokSnapshot {
  return {
    sessionId: "session-1",
    boardId: "board-1",
    gameKind: "omok",
    version,
    serverTimeMs: 1_000,
    rulesVersion: 1,
    stateSchemaVersion: 1,
    previousSessionId: null,
    roomStatus: "active",
    participants: [
      { displayName: "첫째", slot: "first", ready: true },
      { displayName: "둘째", slot: "second", ready: true },
    ],
    viewer: { role: "participant", slot: "first" },
    game: {
      board: Array.from({ length: 225 }, () => null),
      nextTurn: "first",
      status: { status: "playing" },
      moveCount: 0,
      lastMove: null,
    },
    outcome: null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authoritative play wire contract", () => {
  it("keeps schema, TypeScript command, state, and rules versions aligned", () => {
    const schema = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          "services",
          "play-engine",
          "contracts",
          "authoritative-omok-v1.schema.json",
        ),
        "utf8",
      ),
    ) as {
      properties: {
        commandSchemaVersion: { const: number };
        stateSchemaVersion: { const: number };
        rulesVersion: { const: number };
      };
    };
    expect(schema.properties.commandSchemaVersion.const).toBe(
      PLAY_COMMAND_SCHEMA_VERSION,
    );
    expect(schema.properties.stateSchemaVersion.const).toBe(
      PLAY_SESSION_STATE_SCHEMA_VERSION,
    );
    expect(schema.properties.rulesVersion.const).toBe(OMOK_RULES_VERSION);
  });

  it("binds every intent to the currently rendered authoritative version", () => {
    const command = makeOmokCommand(snapshot(12), {
      type: "place_stone",
      position: { row: 7, column: 7 },
    });
    expect(command.expectedVersion).toBe(12);
    expect(command.commandSchemaVersion).toBe(1);
    expect(command.requestId).toMatch(/^place_stone\./);
    expect(command.command).toEqual({
      type: "place_stone",
      position: { row: 7, column: 7 },
    });
  });

  it("treats no current session as a recoverable waiting state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(fetchCurrentOmokSession("board-1")).resolves.toBeNull();
  });

  it("preserves a 409 authority snapshot for immediate client recovery", async () => {
    const current = snapshot(9);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: "version_conflict",
            currentVersion: 9,
            snapshot: current,
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const request = makeOmokCommand(snapshot(8), { type: "ready" });
    try {
      await submitOmokCommand("session-1", request);
      throw new Error("expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(PlayClientError);
      const conflict = error as PlayClientError;
      expect(conflict.status).toBe(409);
      expect(conflict.body.currentVersion).toBe(9);
      expect(isOmokSnapshot(conflict.body.snapshot)).toBe(true);
      expect(conflict.body.snapshot).toEqual(current);
    }
  });

  it("rejects wrong schema versions and malformed board length", () => {
    expect(isOmokSnapshot({ ...snapshot(), rulesVersion: 2 })).toBe(false);
    expect(
      isOmokSnapshot({
        ...snapshot(),
        game: { ...snapshot().game, board: [] },
      }),
    ).toBe(false);
    expect(isOmokSnapshot({ ...snapshot(), participants: [] })).toBe(false);
    const invalidCell = snapshot();
    invalidCell.game.board[0] = "third" as never;
    expect(isOmokSnapshot(invalidCell)).toBe(false);
  });

  it("rejects malformed command responses and never rolls snapshots backward", () => {
    expect(isPlayCommandResponse({ requestId: "r1", version: 8, snapshot: snapshot(8) })).toBe(false);
    expect(mergeOmokCommandSnapshot(snapshot(9), "session-1", snapshot(8))?.version).toBe(9);
    expect(mergeOmokCommandSnapshot(snapshot(9), "old-session", snapshot(10))?.version).toBe(9);
    expect(mergeOmokCommandSnapshot(snapshot(9), "session-1", snapshot(10))?.version).toBe(10);
  });
});
