import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  classroomFindFirst: vi.fn(),
  resolveOrCreateCanonicalGameRoom: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findFirst: mocks.classroomFindFirst },
  },
}));
vi.mock("@/lib/game-platform/hub-room", () => ({
  resolveOrCreateCanonicalGameRoom: mocks.resolveOrCreateCanonicalGameRoom,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/teacher/game-hub/entry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/teacher/game-hub/entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.classroomFindFirst.mockResolvedValue({ id: "classroom-1" });
    mocks.resolveOrCreateCanonicalGameRoom.mockResolvedValue({
      id: "room-1",
      slug: "game-hub-omok-classroom",
      layout: "omok",
      classroomId: "classroom-1",
      systemGameKind: "omok",
    });
  });

  it("requires an authenticated teacher", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await POST(
      request({ gameKind: "omok", classroomId: "classroom-1" }),
    );

    expect(response.status).toBe(401);
    expect(mocks.classroomFindFirst).not.toHaveBeenCalled();
  });

  it("rejects extra authority claims", async () => {
    const response = await POST(
      request({
        gameKind: "omok",
        classroomId: "classroom-1",
        participantId: "student-1",
        score: 9999,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_game_hub_entry" });
    expect(mocks.classroomFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a classroom not owned by the current teacher", async () => {
    mocks.classroomFindFirst.mockResolvedValue(null);

    const response = await POST(
      request({ gameKind: "omok", classroomId: "other-classroom" }),
    );

    expect(response.status).toBe(404);
    expect(mocks.classroomFindFirst).toHaveBeenCalledWith({
      where: { id: "other-classroom", teacherId: "teacher-1" },
      select: { id: true },
    });
    expect(mocks.resolveOrCreateCanonicalGameRoom).not.toHaveBeenCalled();
  });

  it("opens the canonical classroom room and returns a teacher route", async () => {
    const response = await POST(
      request({ gameKind: "omok", classroomId: "classroom-1" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveOrCreateCanonicalGameRoom).toHaveBeenCalledWith(
      { id: "teacher-1", classroomId: "classroom-1" },
      "omok",
    );
    expect(await response.json()).toEqual({
      gameKind: "omok",
      boardId: "room-1",
      boardSlug: "game-hub-omok-classroom",
      href: "/board/game-hub-omok-classroom",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
