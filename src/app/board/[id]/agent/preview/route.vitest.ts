import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ student: vi.fn(), board: vi.fn(), session: vi.fn(), messages: vi.fn() }));
vi.mock("@/lib/agent/access", () => ({ getCurrentAgentStudent: mocks.student }));
vi.mock("@/lib/db", () => ({ db: {
  board: { findFirst: mocks.board }, agentSession: { findFirst: mocks.session },
  agentMessage: { findMany: mocks.messages },
} }));
import { GET } from "./route";
const request = () => new Request("http://localhost/board/slug/agent/preview?session=session");
const context = { params: Promise.resolve({ id: "slug" }) };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.student.mockResolvedValue({ id: "student", classroomId: "class" });
  mocks.board.mockResolvedValue({ id: "board" });
  mocks.session.mockResolvedValue({ id: "session" });
  mocks.messages.mockResolvedValue([]);
});
describe("Agent preview", () => {
  it("serves current JSON code with intact scripts and private sandbox headers", async () => {
    mocks.messages.mockResolvedValue([{ content: JSON.stringify({ code: "<script>const ok = true;</script><div>작품</div>" }) }]);
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("</script><div>작품</div>");
    expect(response.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("returns a valid empty 204 for chat-only sessions", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
  it("rejects foreign board routes before querying messages", async () => {
    mocks.board.mockResolvedValue(null);
    expect((await GET(request(), context)).status).toBe(404);
    expect(mocks.messages).not.toHaveBeenCalled();
    expect(mocks.board.mock.calls[0][0].where.classroomId).toBe("class");
  });
});
