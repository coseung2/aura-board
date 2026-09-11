import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  resolveOrCreateCanonicalGameRoom: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: mocks.getCurrentStudent,
  getCurrentStudentIdentityRaw: mocks.getCurrentStudent,
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => null) }));
afterEach(() => vi.unstubAllEnvs());
vi.mock("@/lib/game-platform/hub-room", () => ({
  resolveOrCreateCanonicalGameRoom: mocks.resolveOrCreateCanonicalGameRoom,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/student/game-hub/entry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/student/game-hub/entry", () => {
  beforeEach(() => {
    vi.stubEnv("AURA_ADMIN_EMAILS", "pilot@example.com");
    mocks.getCurrentStudent.mockReset().mockResolvedValue({
      id: "student-1",
      classroomId: "classroom-1",
      classroom: { teacher: { email: "pilot@example.com" } },
    });
    mocks.resolveOrCreateCanonicalGameRoom.mockReset().mockResolvedValue({
      id: "room-1",
      slug: "game-hub-omok-classroom",
      layout: "omok",
      classroomId: "classroom-1",
      systemGameKind: "omok",
    });
  });

  it("rejects a non-pilot classroom before creating a room", async () => {
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1", classroom: { teacher: { email: "normal@example.com" } } });
    const response = await POST(request({ gameKind: "omok" }));
    expect(response.status).toBe(403);
    expect(mocks.resolveOrCreateCanonicalGameRoom).not.toHaveBeenCalled();
  });

  it("requires an authenticated student", async () => {
    mocks.getCurrentStudent.mockResolvedValue(null);
    const response = await POST(request({ gameKind: "omok" }));
    expect(response.status).toBe(401);
    expect(mocks.resolveOrCreateCanonicalGameRoom).not.toHaveBeenCalled();
  });

  it("rejects client authority claims instead of forwarding them", async () => {
    const response = await POST(
      request({ gameKind: "omok", score: 9999, durationMs: 1 }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_game_hub_entry" });
    expect(mocks.resolveOrCreateCanonicalGameRoom).not.toHaveBeenCalled();
  });

  it("resolves a server-owned classroom room and returns a controlled route", async () => {
    const response = await POST(request({ gameKind: "omok" }));
    expect(response.status).toBe(200);
    expect(mocks.resolveOrCreateCanonicalGameRoom).toHaveBeenCalledWith(
      { id: "student-1", classroomId: "classroom-1" },
      "omok",
      { allowCreate: true },
    );
    expect(await response.json()).toEqual({
      gameKind: "omok",
      boardId: "room-1",
      boardSlug: "game-hub-omok-classroom",
      href: "/board/game-hub-omok-classroom?view=student",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it.each(["kordle", "speed-game", "shadow-alliance"])("waits for teacher creation for %s", async (gameKind) => {
    mocks.resolveOrCreateCanonicalGameRoom.mockRejectedValue(new Error("teacher_room_not_open"));
    const response = await POST(request({ gameKind }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "teacher_room_not_open" });
    expect(mocks.resolveOrCreateCanonicalGameRoom).toHaveBeenCalledWith(expect.any(Object), gameKind, { allowCreate: false });
  });
});
