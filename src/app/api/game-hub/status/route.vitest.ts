import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ student: vi.fn(), user: vi.fn(), classrooms: vi.fn(), boards: vi.fn(), tickets: vi.fn(), sessions: vi.fn(), engine: vi.fn(), actor: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.student }));
vi.mock("@/lib/product-release-server", () => ({ withProductFeature: (_: unknown, fn: unknown) => fn }));
vi.mock("@/lib/play-platform/server-client", () => ({ playEngineFetch: mocks.engine }));
vi.mock("@/lib/play-platform/actor", () => ({ resolveSongGuessActorForBoard: mocks.actor }));
vi.mock("@/lib/db", () => ({ db: {
  classroom: { findMany: mocks.classrooms }, board: { findMany: mocks.boards },
  omokMatchTicket: { findMany: mocks.tickets }, playSession: { findMany: mocks.sessions },
} }));
import { GET } from "./route";

function songBoard() {
  return { id: "board", systemGameKind: "song-guess", speedGameRuns: [], kordleGame: null, playSessions: [
    { completedAtMs: null, state: { rulesVersion: 2, state: { phase: "guessing", participants: [{ joined: true }, { joined: false }] } } },
    { completedAtMs: null, state: { rulesVersion: 2, state: { phase: "lobby", participants: [{ joined: true }] } } },
  ] };
}

describe("authorized game hub state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.student.mockResolvedValue({ id: "student", classroomId: "class" });
    mocks.boards.mockResolvedValue([]);
    mocks.tickets.mockResolvedValue([]);
    mocks.sessions.mockResolvedValue([]);
    mocks.actor.mockResolvedValue({ actor: { subject: "student:student" } });
  });
  it("rejects an unauthenticated caller without reading game data", async () => {
    mocks.student.mockResolvedValue(null); mocks.user.mockResolvedValue(null);
    const result = await GET(new Request("http://localhost/api/game-hub/status"), undefined);
    expect(result.status).toBe(401); expect(mocks.boards).not.toHaveBeenCalled();
  });
  it("returns the authorized classroom channel even before any game room exists", async () => {
    const body = await (await GET(new Request("http://localhost/api/game-hub/status"), undefined)).json();
    expect(body.channels).toEqual(["classroom:class:game-hub"]);
    expect(body.statuses.omok).toEqual({ phase: "open", label: "입장 가능", playerCount: 0 });
    expect(mocks.boards.mock.calls[0][0].where.classroomId).toEqual({ in: ["class"] });
  });
  it("aggregates all eligible song rooms rather than only the latest current one", async () => {
    mocks.boards.mockResolvedValue([songBoard()]);
    const body = await (await GET(new Request("http://localhost/api/game-hub/status"), undefined)).json();
    expect(body.statuses["song-guess"]).toEqual({ phase: "active", label: "진행 중", playerCount: 2 });
    expect(mocks.boards.mock.calls[0][0].select.playSessions.take).toBeUndefined();
  });
  it("lets the engine commit overdue room completion before reporting status", async () => {
    const board = songBoard();
    Object.assign(board.playSessions[0].state, { nextTransitionAtMs: Date.now() - 1 });
    mocks.boards.mockResolvedValue([board]);
    mocks.engine.mockResolvedValue(Response.json({ sessions: [] }));
    const body = await (await GET(new Request("http://localhost/api/game-hub/status"), undefined)).json();
    expect(mocks.engine).toHaveBeenCalledOnce();
    expect(body.statuses["song-guess"].phase).toBe("open");
  });
  it("does not assert that an overdue room is active when authority cannot confirm it", async () => {
    const board = songBoard(); Object.assign(board.playSessions[0].state, { nextTransitionAtMs: Date.now() - 1 });
    mocks.boards.mockResolvedValue([board]); mocks.engine.mockResolvedValue(new Response(null, { status: 503 }));
    const body = await (await GET(new Request("http://localhost/api/game-hub/status"), undefined)).json();
    expect(body.statuses["song-guess"].label).toBe("상태 확인 필요");
  });
});
