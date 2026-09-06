import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ db: { board: { findFirst: query } } }));
import { loadStudentBoardBase } from "./student-board-loader";

beforeEach(() => { query.mockReset(); vi.stubEnv("AURA_ADMIN_EMAILS", "pilot@example.com"); });
afterEach(() => vi.unstubAllEnvs());
function metadata(layout: string, email = "pilot@example.com") {
  return { id: "board", classroomId: "class", layout, classroom: { teacherId: "teacher", teacher: { email } } };
}

describe("student board query dispatch", () => {
  it.each(["omok", "kordle", "song-guess", "speed-game", "shadow-alliance", "assignment"])("loads %s without a card/attachment/section query", async (layout) => {
    query.mockResolvedValue(metadata(layout));
    const board = await loadStudentBoardBase("class", "slug");
    expect(board?.cards).toEqual([]);
    expect(board?.sections).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0].include).not.toHaveProperty("cards");
    expect(query.mock.calls[0][0].include).not.toHaveProperty("sections");
    expect(query.mock.calls[0][0].where.classroomId).toBe("class");
  });
  it("does not hydrate forbidden development boards", async () => {
    query.mockResolvedValue(metadata("stream", "normal@example.com"));
    expect((await loadStudentBoardBase("class", "slug"))?.cards).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("loads a stable card graph only after resolving the board's classroom", async () => {
    query.mockResolvedValueOnce(metadata("columns", "normal@example.com"));
    query.mockResolvedValueOnce({ cards: [{ id: "card" }], sections: [] });
    expect((await loadStudentBoardBase("class", "slug"))?.cards).toEqual([{ id: "card" }]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0].where).toEqual({ id: "board", classroomId: "class" });
  });
  it("does not fetch a graph for a missing board", async () => {
    query.mockResolvedValue(null);
    expect(await loadStudentBoardBase("class", "slug")).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
