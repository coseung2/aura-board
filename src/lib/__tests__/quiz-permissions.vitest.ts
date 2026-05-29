import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Identities } from "../card-permissions";

// Shim the Prisma client — canManageQuiz only touches db.quiz.findUnique.
const findUnique = vi.fn();
vi.mock("../db", () => ({
  db: { quiz: { findUnique } },
}));

// Import AFTER the mock so the helper picks up the shimmed db.
const { canManageQuiz } = await import("../quiz-permissions");

function teacherIds(owned: string[]): Identities {
  return {
    teacher: {
      userId: "t1",
      name: "선생",
      ownsBoardIds: new Set(owned),
    },
    student: null,
    parent: null,
    share: null,
  primary: "teacher",
  };
}

const STUDENT_IDS: Identities = {
  teacher: null,
  student: { studentId: "s1", name: "학생", classroomId: "c1" },
  parent: null,
  share: null,
  primary: "student",
};

const ANON_IDS: Identities = {
  teacher: null,
  student: null,
  parent: null,
  share: null,
  primary: "anon",
};

describe("canManageQuiz", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("returns true when the teacher owns the quiz's board", async () => {
    findUnique.mockResolvedValueOnce({ boardId: "b1" });
    expect(await canManageQuiz("q1", teacherIds(["b1", "b9"]))).toBe(true);
  });

  it("returns false when the teacher does not own the board", async () => {
    findUnique.mockResolvedValueOnce({ boardId: "b1" });
    expect(await canManageQuiz("q1", teacherIds(["b9"]))).toBe(false);
  });

  it("returns false for a student identity", async () => {
    // findUnique must not even be called for a non-teacher identity.
    expect(await canManageQuiz("q1", STUDENT_IDS)).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns false for anonymous requests", async () => {
    expect(await canManageQuiz("q1", ANON_IDS)).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns false when the quiz does not exist", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await canManageQuiz("missing", teacherIds(["b1"]))).toBe(false);
  });
});
