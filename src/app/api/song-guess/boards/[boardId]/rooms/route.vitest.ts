import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), build: vi.fn(), catalog: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/play-platform/actor", () => ({ resolveSongGuessActorForBoard: mocks.actor }));
vi.mock("@/lib/play-platform/server-client", () => ({ playEngineFetch: mocks.fetch, proxyPlayEngineResponse: (value: Response) => value }));
vi.mock("@/lib/play-platform/route-utils", () => ({ playRouteError: () => Response.json({ error: "forbidden" }, { status: 403 }) }));
vi.mock("@/lib/song-guess/student-rooms", () => ({ buildStudentRoomRequest: mocks.build, studentRoomCatalog: mocks.catalog }));
vi.mock("@/lib/song-guess/server", () => ({ enrichSongGuessPlayEngineResponse: (value: Response) => value }));
import { GET, POST } from "./route";
const params = { params: Promise.resolve({ boardId: "b1" }) };
const input = { requestId: "req1", categories: ["classical"], segment: "highlight", count: 5 };
function request(body: unknown) { return new Request("http://localhost/api/song-guess/boards/b1/rooms", { method: "POST", body: JSON.stringify(body) }); }
describe("song room routes", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.actor.mockResolvedValue({ actor: { subject: "student:1" } });
    mocks.fetch.mockResolvedValue(Response.json({ sessions: [] })); mocks.build.mockResolvedValue({ serverOwned: true });
  });
  it.each([{ classroomTeacherSubject: "teacher:fake" }, { participants: [] }, { roomMode: "teacher-led" }, { rounds: [] }])("rejects client authority claims %j", async (claim) => {
    expect((await POST(request({ ...input, ...claim }), params)).status).toBe(400);
    expect(mocks.build).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("forwards only server-built creation data", async () => {
    expect((await POST(request(input), params)).status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledWith("/v1/boards/b1/song-guess/sessions", { actor: { subject: "student:1" }, method: "POST", body: { serverOwned: true } });
  });
  it("checks classroom scope before listing or catalog lookup", async () => {
    mocks.actor.mockRejectedValue(new Error("foreign classroom"));
    expect((await GET(new Request("http://localhost/rooms"), params)).status).toBe(403);
    expect((await GET(new Request("http://localhost/rooms?catalog=1"), params)).status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.catalog).not.toHaveBeenCalled();
  });
});
