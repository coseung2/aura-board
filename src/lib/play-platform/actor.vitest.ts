import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCurrentStudentIdentityRaw: vi.fn(),
  boardFindUnique: vi.fn(),
  boardMemberFindFirst: vi.fn(),
  sessionFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => {
  const user = await mocks.getCurrentUser();
  return user ? { email: "pilot@example.com", ...user } : null;
} }));
afterEach(() => vi.unstubAllEnvs());
vi.mock("@/lib/student-auth", () => ({
  getCurrentStudentIdentityRaw: mocks.getCurrentStudentIdentityRaw,
}));
vi.mock("@/lib/db", () => ({
  db: {
    board: { findUnique: mocks.boardFindUnique },
    boardMember: { findFirst: mocks.boardMemberFindFirst },
    playSession: { findUnique: mocks.sessionFindUnique },
  },
}));

import {
  PlayAccessError,
  resolvePlayActorForBoard,
  resolveSongGuessActorForBoard,
  resolveSongGuessActorForSession,
} from "./actor";

describe("song-guess board ownership", () => {
  it("checks current classroom ownership again for an existing session", async () => {
    mocks.sessionFindUnique.mockResolvedValue({ boardId: "board-1", gameKind: "song-guess" });
    mocks.getCurrentUser.mockResolvedValue({ id: "other-teacher" });
    await expect(resolveSongGuessActorForSession("session-1")).rejects.toMatchObject({ status: 403 });
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    await expect(resolveSongGuessActorForSession("session-1")).resolves.toMatchObject({ subject: "teacher:teacher-1" });
  });
  it("rejects wrong-game session IDs before board authorization", async () => {
    mocks.sessionFindUnique.mockResolvedValue({ boardId: "board-1", gameKind: "omok" });
    await expect(resolveSongGuessActorForSession("session-1")).rejects.toMatchObject({ status: 404 });
    expect(mocks.boardFindUnique).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AURA_ADMIN_EMAILS", "pilot@example.com");
    mocks.getCurrentStudentIdentityRaw.mockResolvedValue(null);
    mocks.boardFindUnique.mockResolvedValue({
      id: "board-1",
      layout: "columns",
      classroomId: "class-1",
      classroom: { teacherId: "teacher-1" },
    });
    mocks.boardMemberFindFirst.mockResolvedValue(null);
  });

  it("rejects a non-admin host before resource lookup", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "normal", email: "normal@example.com" });
    await expect(resolvePlayActorForBoard("board-1")).rejects.toMatchObject({ status: 403, code: "feature_unavailable" });
    expect(mocks.boardFindUnique).not.toHaveBeenCalled();
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
    mocks.getCurrentStudentIdentityRaw.mockResolvedValue({
      id: "student-1",
      name: "학생",
      classroomId: "other-class",
      classroom: { teacher: { email: "pilot@example.com" } },
    });
    await expect(resolveSongGuessActorForBoard("board-1")).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
  });

  it("keeps the omok layout gate separate from shared board access", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });

    await expect(resolveSongGuessActorForBoard("board-1")).resolves.toBeTruthy();
    await expect(resolvePlayActorForBoard("board-1")).rejects.toMatchObject({
      status: 404,
      code: "play_board_not_found",
    });
  });
});
