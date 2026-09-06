import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({ user: vi.fn(), student: vi.fn(), classroom: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/student-auth", () => ({ getCurrentStudentIdentityRaw: mocks.student }));
vi.mock("@/lib/db", () => ({ db: { classroom: { findUnique: mocks.classroom } } }));
import { studentReleaseAudience, withProductFeature } from "./product-release-server";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AURA_ADMIN_EMAILS", "admin@example.com");
  mocks.user.mockResolvedValue(null);
  mocks.student.mockResolvedValue(null);
  mocks.classroom.mockResolvedValue({ teacher: { email: "normal@example.com" } });
});
afterEach(() => vi.unstubAllEnvs());

function guarded() {
  const handler = vi.fn(async (_req: Request) => Response.json({ ok: true }));
  return { handler, run: withProductFeature("play", handler) };
}
const request = () => new Request("http://localhost/api/student/game-hub/entry", { method: "POST" });

describe("request-bound product authorization", () => {
  it("rejects guests before executing the handler", async () => {
    const { handler, run } = guarded();
    expect((await run(request())).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
  it("rejects a normal teacher without a student/database fallback", async () => {
    mocks.user.mockResolvedValue({ id: "teacher", email: "normal@example.com" });
    const { handler, run } = guarded();
    const response = await run(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "feature_unavailable" });
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.student).not.toHaveBeenCalled();
  });
  it("lets an administrator reach the existing resource authorization", async () => {
    mocks.user.mockResolvedValue({ id: "admin", email: "admin@example.com" });
    const { handler, run } = guarded();
    const req = request();
    expect((await run(req)).status).toBe(200);
    expect(handler).toHaveBeenCalledWith(req);
  });
  it("rejects a normal classroom student", async () => {
    mocks.student.mockResolvedValue({ id: "student", classroomId: "class" });
    const { handler, run } = guarded();
    expect((await run(request())).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.classroom.mock.calls[0][0].where).toEqual({ id: "class" });
  });
  it("allows a pilot classroom student, but not teacher community operations", async () => {
    mocks.student.mockResolvedValue({ id: "student", classroomId: "class" });
    mocks.classroom.mockResolvedValue({ teacher: { email: "admin@example.com" } });
    const { handler, run } = guarded();
    expect((await run(request())).status).toBe(200);
    expect((await withProductFeature("community", handler)(request())).status).toBe(403);
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it("fails closed without disclosing a database error", async () => {
    mocks.student.mockResolvedValue({ id: "student", classroomId: "class" });
    mocks.classroom.mockRejectedValue(new Error("private database detail"));
    const { handler, run } = guarded();
    const response = await run(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database");
    expect(handler).not.toHaveBeenCalled();
  });
  it("denies real game, feed, quiz and Vibe route exports before their database work", async () => {
    mocks.user.mockResolvedValue({ id: "normal", email: "normal@example.com" });
    const modules = await Promise.all([
      import("@/app/api/student/game-hub/entry/route"),
      import("@/app/api/teacher/feed/route"),
      import("@/app/api/quiz/join/route"),
      import("@/app/api/vibe/config/route"),
    ]);
    const responses = await Promise.all([
      modules[0].POST(request()), modules[1].GET(request()),
      modules[2].POST(request()), modules[3].PATCH(request()),
    ]);
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403]);
    expect(mocks.classroom).not.toHaveBeenCalled();
  });
  it("reuses a teacher email already loaded with the student", async () => {
    expect(await studentReleaseAudience({ classroomId: "class", classroom: { teacher: { email: "admin@example.com" } } })).toEqual({ isAdminClassroom: true });
    expect(mocks.classroom).not.toHaveBeenCalled();
  });
});

function routes(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry): string[] => {
    const file = join(path, entry.name);
    return entry.isDirectory() ? routes(file) : entry.name === "route.ts" ? [file] : [];
  });
}

describe("experimental API inventory", () => {
  const families = ["student/feed", "teacher/feed", "teacher/share", "vibe", "quiz", "assessment", "kordle", "speed-game", "shadow-alliance", "student/game-hub", "teacher/game-hub", "student/game-records", "game-hub/status", "breakout", "boards/[id]/breakout", "sections/[id]/breakout", "boards/[id]/question-config", "boards/[id]/responses", "projects/[id]/reviews"];
  const retired = new Set(["src/app/api/quiz/settings/route.ts", "src/app/api/speed-game/games/[gameId]/stream/route.ts"]);
  for (const file of families.flatMap((family) => routes(`src/app/api/${family}`))) {
    it(`${file} gates each exported HTTP handler`, () => {
      const source = readFileSync(file, "utf8");
      if (retired.has(file.replaceAll("\\", "/"))) {
        expect(source).toMatch(/status:\s*410/);
        return;
      }
      const exports = [...source.matchAll(/^export (?:async function|const) (GET|POST|PATCH|PUT|DELETE)\b/gm)].map((match) => match[1]);
      expect(exports.length).toBeGreaterThan(0);
      for (const method of exports) {
        expect(source).toMatch(new RegExp(`export const ${method} = withProductFeature\\(`));
      }
    });
  }
});
