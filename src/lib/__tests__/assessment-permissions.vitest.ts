import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Identities } from "../card-permissions";

const templateFind = vi.fn();
const submissionFind = vi.fn();
vi.mock("../db", () => ({
  db: {
    assessmentTemplate: { findUnique: templateFind },
    assessmentSubmission: { findUnique: submissionFind },
  },
}));

const {
  canManageAssessment,
  canViewAssessmentTemplate,
  canAccessSubmission,
} = await import("../assessment-permissions");

const teacherA: Identities = {
  teacher: {
    userId: "u_teacher_a",
    name: "T",
    ownsBoardIds: new Set<string>(),
  },
  student: null,
  parent: null,
  share: null,
  primary: "teacher",
};

const teacherB: Identities = {
  teacher: {
    userId: "u_teacher_b",
    name: "Tb",
    ownsBoardIds: new Set<string>(),
  },
  student: null,
  parent: null,
  share: null,
  primary: "teacher",
};

const studentIn: Identities = {
  teacher: null,
  student: { studentId: "s_in", name: "s", classroomId: "c_1" },
  parent: null,
  share: null,
  primary: "student",
};

const studentOut: Identities = {
  teacher: null,
  student: { studentId: "s_out", name: "s2", classroomId: "c_other" },
  parent: null,
  share: null,
  primary: "student",
};

const anon: Identities = {
  teacher: null,
  student: null,
  parent: null,
  share: null,
  primary: "anon",
};

describe("canManageAssessment", () => {
  beforeEach(() => {
    templateFind.mockReset();
  });

  it("true when teacher owns classroom", async () => {
    templateFind.mockResolvedValueOnce({
      classroom: { teacherId: "u_teacher_a" },
    });
    expect(await canManageAssessment("t1", teacherA)).toBe(true);
  });

  it("false when teacher is not the classroom owner", async () => {
    templateFind.mockResolvedValueOnce({
      classroom: { teacherId: "u_teacher_a" },
    });
    expect(await canManageAssessment("t1", teacherB)).toBe(false);
  });

  it("false for student and anon regardless of DB row", async () => {
    expect(await canManageAssessment("t1", studentIn)).toBe(false);
    expect(await canManageAssessment("t1", anon)).toBe(false);
    expect(templateFind).not.toHaveBeenCalled();
  });

  it("false when template not found", async () => {
    templateFind.mockResolvedValueOnce(null);
    expect(await canManageAssessment("missing", teacherA)).toBe(false);
  });
});

describe("canViewAssessmentTemplate", () => {
  beforeEach(() => {
    templateFind.mockReset();
  });

  it("student in same classroom can view", async () => {
    templateFind.mockResolvedValueOnce({ classroomId: "c_1" });
    expect(await canViewAssessmentTemplate("t1", studentIn)).toBe(true);
  });

  it("student in different classroom denied", async () => {
    templateFind.mockResolvedValueOnce({ classroomId: "c_1" });
    expect(await canViewAssessmentTemplate("t1", studentOut)).toBe(false);
  });

  it("anon denied", async () => {
    expect(await canViewAssessmentTemplate("t1", anon)).toBe(false);
  });

  it("teacher delegates to manage path", async () => {
    templateFind.mockResolvedValueOnce({
      classroom: { teacherId: "u_teacher_a" },
    });
    expect(await canViewAssessmentTemplate("t1", teacherA)).toBe(true);
  });

  it("non-owner teacher + student-in bundle falls through to student check", async () => {
    // manage path: teacher_b does NOT own the classroom (teacherId=a)
    templateFind.mockResolvedValueOnce({
      classroom: { teacherId: "u_teacher_a" },
    });
    // student path: template belongs to c_1 and studentIn.classroomId="c_1"
    templateFind.mockResolvedValueOnce({ classroomId: "c_1" });
    const bundle: Identities = { ...studentIn, teacher: teacherB.teacher };
    expect(await canViewAssessmentTemplate("t1", bundle)).toBe(true);
  });
});

describe("canAccessSubmission", () => {
  beforeEach(() => {
    submissionFind.mockReset();
  });

  it("owning student passes (asTeacher=false)", async () => {
    submissionFind.mockResolvedValueOnce({
      studentId: "s_in",
      template: { classroom: { teacherId: "u_teacher_a" } },
    });
    expect(await canAccessSubmission("s1", studentIn)).toEqual({
      allowed: true,
      asTeacher: false,
    });
  });

  it("classroom teacher passes (asTeacher=true)", async () => {
    submissionFind.mockResolvedValueOnce({
      studentId: "s_in",
      template: { classroom: { teacherId: "u_teacher_a" } },
    });
    expect(await canAccessSubmission("s1", teacherA)).toEqual({
      allowed: true,
      asTeacher: true,
    });
  });

  it("other-class student denied", async () => {
    submissionFind.mockResolvedValueOnce({
      studentId: "s_in",
      template: { classroom: { teacherId: "u_teacher_a" } },
    });
    expect(await canAccessSubmission("s1", studentOut)).toEqual({
      allowed: false,
      asTeacher: false,
    });
  });

  it("missing submission denied", async () => {
    submissionFind.mockResolvedValueOnce(null);
    expect(await canAccessSubmission("missing", teacherA)).toEqual({
      allowed: false,
      asTeacher: false,
    });
  });
});
