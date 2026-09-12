import { beforeEach, describe, expect, it, vi } from "vitest";

// SecureStore and the API client are the only React Native dependencies of the
// durable pending layer, so they are replaced with in-memory doubles here.
const store = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void store.set(key, value),
  deleteItemAsync: async (key: string) => void store.delete(key),
}));
vi.mock("./api", () => ({
  apiFetch: async () => {
    throw new Error("network disabled in this test");
  },
  ApiError: class ApiError extends Error {
    status = 0;
    body: unknown = null;
  },
}));

const {
  clearPendingOmokCommand,
  legacyPendingOmokKey,
  loadPendingOmokCommand,
  migrateLegacyPendingOmokCommand,
  pendingOmokKey,
  savePendingOmokCommand,
} = await import("./play-platform");

const stonePending = {
  sessionId: "fabf8167-1399-4f2f-99e4-4d2bf56c9d66",
  request: {
    requestId: "place_stone.abc",
    expectedVersion: 4,
    commandSchemaVersion: 1 as const,
    command: { type: "place_stone" as const, position: { row: 7, column: 7 } },
  },
};
const resignPending = {
  sessionId: stonePending.sessionId,
  request: {
    requestId: "resign.def",
    expectedVersion: 4,
    commandSchemaVersion: 1 as const,
    command: { type: "resign" as const },
  },
};

beforeEach(() => store.clear());

describe("durable omok pending scope", () => {
  it("keeps a stone and a resign in separate slots", async () => {
    await savePendingOmokCommand(stonePending);
    await savePendingOmokCommand(resignPending);

    expect((await loadPendingOmokCommand(stonePending.sessionId, "place_stone"))?.request.requestId)
      .toBe("place_stone.abc");
    expect((await loadPendingOmokCommand(stonePending.sessionId, "resign"))?.request.requestId)
      .toBe("resign.def");

    await clearPendingOmokCommand(stonePending.sessionId, "resign");
    expect(await loadPendingOmokCommand(stonePending.sessionId, "resign")).toBeNull();
    expect(await loadPendingOmokCommand(stonePending.sessionId, "place_stone")).not.toBeNull();
  });

  it("does not return another session's pending command", async () => {
    await savePendingOmokCommand(stonePending);
    expect(await loadPendingOmokCommand("other-session", "place_stone")).toBeNull();
  });

  it("sanitizes the key so SecureStore accepts it", () => {
    const key = pendingOmokKey("session/with:odd chars", "place_stone");
    expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it("migrates the legacy board key once, preserving the receipt identity", async () => {
    store.set(legacyPendingOmokKey("board-1"), JSON.stringify(stonePending));

    const migrated = await migrateLegacyPendingOmokCommand("board-1");
    expect(migrated?.request).toEqual(stonePending.request);
    expect(store.has(legacyPendingOmokKey("board-1"))).toBe(false);
    expect((await loadPendingOmokCommand(stonePending.sessionId, "place_stone"))?.request)
      .toEqual(stonePending.request);

    // A second migration finds nothing and must not resurrect the entry.
    expect(await migrateLegacyPendingOmokCommand("board-1")).toBeNull();
  });

  it("discards an unparsable or stale legacy payload", async () => {
    store.set(legacyPendingOmokKey("board-1"), "not json");
    expect(await migrateLegacyPendingOmokCommand("board-1")).toBeNull();
    expect(store.has(legacyPendingOmokKey("board-1"))).toBe(false);

    store.set(
      pendingOmokKey(stonePending.sessionId, "place_stone"),
      JSON.stringify({ sessionId: stonePending.sessionId, request: { requestId: "x" } }),
    );
    expect(await loadPendingOmokCommand(stonePending.sessionId, "place_stone")).toBeNull();
  });
});
