export type StudentAuthorInput = {
  studentId?: string | null;
  displayName: string;
};

export type ClassroomStudentAuthor = {
  id: string;
  name: string;
};

export type StudentAuthorPolicyError =
  | "student_primary_required"
  | "student_freeform_forbidden"
  | "student_not_in_classroom";

export function normalizeStudentAuthorInputs(
  inputs: StudentAuthorInput[],
  actorStudentId: string,
  roster: ClassroomStudentAuthor[],
):
  | { ok: true; authors: Array<{ studentId: string; displayName: string }> }
  | { ok: false; error: StudentAuthorPolicyError } {
  if (inputs[0]?.studentId !== actorStudentId) {
    return { ok: false, error: "student_primary_required" };
  }
  if (inputs.some((author) => !author.studentId)) {
    return { ok: false, error: "student_freeform_forbidden" };
  }

  const namesById = new Map(
    roster.map((student) => [student.id, student.name]),
  );
  const authors: Array<{ studentId: string; displayName: string }> = [];
  for (const author of inputs) {
    const studentId = author.studentId!;
    const displayName = namesById.get(studentId);
    if (!displayName) {
      return { ok: false, error: "student_not_in_classroom" };
    }
    authors.push({ studentId, displayName });
  }

  return { ok: true, authors };
}
