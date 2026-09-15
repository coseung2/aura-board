import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(), rooms: vi.fn(), tickets: vi.fn(), close: vi.fn(), clear: vi.fn(), transaction: vi.fn(), announce: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {
  playSession: { findFirst: mocks.session },
  omokLobbyRoom: { findMany: mocks.rooms, updateMany: mocks.close },
  omokMatchTicket: { findMany: mocks.tickets, updateMany: mocks.clear },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/realtime-broadcast", () => ({ announceOmokMatchmakingChange: mocks.announce }));
import { retireFinishedOmokSession } from "./omok-lobby-lifecycle";

describe("retiring transient omok lobby state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ completedAtMs: 42n, state: {} });
    mocks.rooms.mockResolvedValue([{ lobbyBoardId: "lobby" }]);
    mocks.tickets.mockResolvedValue([{ lobbyBoardId: "lobby" }, { lobbyBoardId: "lobby" }]);
    mocks.close.mockResolvedValue({ count: 1 });
    mocks.clear.mockResolvedValue({ count: 2 });
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });
  it("cleans only the completed session and broadcasts once without deleting history", async () => {
    expect(await retireFinishedOmokSession("old-session")).toBe(true);
    expect(mocks.close).toHaveBeenCalledWith({ where: { sessionId: "old-session", status: "active" }, data: { status: "closed" } });
    expect(mocks.clear.mock.calls[0][0].where).toEqual({ sessionId: "old-session", status: "matched" });
    expect(mocks.announce).toHaveBeenCalledExactlyOnceWith("lobby");
  });
  it.each([null, { completedAtMs: null, state: { state: { roomStatus: "active" } } }])("does not infer a terminal result from missing or live state", async (session) => {
    mocks.session.mockResolvedValue(session);
    expect(await retireFinishedOmokSession("session")).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("supports older terminal records that lack the completed timestamp", async () => {
    mocks.session.mockResolvedValue({ completedAtMs: null, state: { state: { roomStatus: "finished" } } });
    expect(await retireFinishedOmokSession("session")).toBe(true);
  });
  it("is idempotent after cleanup and cannot retire a newer rematch", async () => {
    mocks.rooms.mockResolvedValue([]);
    mocks.tickets.mockResolvedValue([]);
    expect(await retireFinishedOmokSession("old-session")).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.announce).not.toHaveBeenCalled();
  });
});
