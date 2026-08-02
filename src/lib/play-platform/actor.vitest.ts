import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCurrentStudentRaw: vi.fn(),
  boardFindUnique: vi.fn(),
  boardMemberFindFirst: vi.fn(),
  studentFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/student-auth", () => ({ getCurrentStudentRaw: mocks.getCurrentStudentRaw }));
vi.mock("@/lib/db", () => ({
  db: {
    board: { findUnique: mocks.boardFindUnique },
    boardMember: { findFirst: mocks.boardMemberFindFirst },
    student: { findUnique: mocks.studentFindUnique },
  },
}));

import { PlayAccessError, resolveSongGuessActorForBoard } from "./actor";

describe("song-guess board ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudentRaw.mockResolvedValue(null);
    mocks.boardFindUnique.mockResolvedValue({
      id: "board-1",
      classroomId: "class-1",
      classroom: { teacherId: "teacher-1" },
    });
    mocks.boardMemberFindFirst.mockResolvedValue(null);
  });

  it("allows the classroom teacher without relying on a public board URL", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    await expect(resolveSongGuessActorForBoard("board-1")).resolves.toMatchObject({
      actor: { subject: "teacher:teacher-1", role: "host" },
    });
  });

  it("allows an editor but rejects an unrelated teacher", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "editor-1" });
    mocks.boardMemberFindFirst.mockResolvedValue({ id: "membership-1" });
    await expect(resolveSongGuessActorForBoard("board-1")).resolves.toBeTruthy();

    mocks.getCurrentUser.mockResolvedValue({ id: "other-teacher" });
    mocks.boardMemberFindFirst.mockResolvedValue(null);
    await expect(resolveSongGuessActorForBoard("board-1")).rejects.toMatchObject<PlayAccessError>({
      status: 403,
      code: "forbidden",
    });
  });

  it("requires a student to belong to the board classroom", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("Unauthenticated"));
    mocks.getCurrentStudentRaw.mockResolvedValue({ id: "student-1" });
    mocks.studentFindUnique.mockResolvedValue({ classroomId: "other-class" });
    await expect(resolveSongGuessActorForBoard("board-1")).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
  });
});
