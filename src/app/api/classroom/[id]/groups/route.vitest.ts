import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), classroom: vi.fn(), students: vi.fn(), load: vi.fn(), save: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/db", () => ({ db: { classroom: { findUnique: mocks.classroom }, student: { findMany: mocks.students }, $transaction: mocks.transaction } }));
vi.mock("@/lib/default-groups", () => ({ loadClassroomDefaultGroups: mocks.load, saveClassroomDefaultGroups: mocks.save }));
import { GET, PUT } from "./route";
const context = { params: Promise.resolve({ id: "c1" }) };
const groups = [{ name: "1모둠", studentIds: ["s1"] }];
const request = (method: string) => new Request("http://localhost/api/classroom/c1/groups", { method, ...(method === "PUT" ? { body: JSON.stringify({ groups }) } : {}) });
describe("seating classroom ownership", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: "teacher", email: "ordinary@example.com" });
    mocks.classroom.mockResolvedValue({ id: "c1", teacherId: "teacher" });
    mocks.students.mockResolvedValue([{ id: "s1", name: "학생" }]);
    mocks.load.mockResolvedValue(groups);
    mocks.transaction.mockImplementation(async callback => callback({}));
  });
  it.each(["GET", "PUT"])("allows an ordinary owner to %s", async method => {
    const response = await (method === "GET" ? GET : PUT)(request(method), context);
    expect(response.status).toBe(200);
    expect((await response.json()).groups).toEqual(groups);
    if (method === "PUT") expect(mocks.save).toHaveBeenCalledWith({}, "c1", groups);
  });
  it.each(["GET", "PUT"])("rejects anonymous %s", async method => {
    mocks.user.mockResolvedValue(null);
    expect((await (method === "GET" ? GET : PUT)(request(method), context)).status).toBe(404);
    expect(mocks.classroom).not.toHaveBeenCalled();
  });
  it.each(["GET", "PUT"])("rejects another teacher or non-owner actor for %s", async method => {
    mocks.classroom.mockResolvedValue({ teacherId: "someone-else" });
    expect((await (method === "GET" ? GET : PUT)(request(method), context)).status).toBe(404);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
