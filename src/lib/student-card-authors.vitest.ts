import { describe, expect, it } from "vitest";

import { normalizeStudentAuthorInputs } from "./student-card-authors";

const roster = [
  { id: "student-1", name: "김하늘" },
  { id: "student-2", name: "이바다" },
];

describe("student card author policy", () => {
  it("keeps the acting student primary and uses canonical roster names", () => {
    expect(
      normalizeStudentAuthorInputs(
        [
          { studentId: "student-1", displayName: "선생님" },
          { studentId: "student-2", displayName: "다른 이름" },
        ],
        "student-1",
        roster,
      ),
    ).toEqual({
      ok: true,
      authors: [
        { studentId: "student-1", displayName: "김하늘" },
        { studentId: "student-2", displayName: "이바다" },
      ],
    });
  });

  it("rejects transferring primary authorship", () => {
    expect(
      normalizeStudentAuthorInputs(
        [{ studentId: "student-2", displayName: "이바다" }],
        "student-1",
        roster,
      ),
    ).toEqual({ ok: false, error: "student_primary_required" });
  });

  it("rejects free-form and out-of-classroom authors", () => {
    expect(
      normalizeStudentAuthorInputs(
        [
          { studentId: "student-1", displayName: "김하늘" },
          { studentId: null, displayName: "교사 사칭" },
        ],
        "student-1",
        roster,
      ),
    ).toEqual({ ok: false, error: "student_freeform_forbidden" });

    expect(
      normalizeStudentAuthorInputs(
        [
          { studentId: "student-1", displayName: "김하늘" },
          { studentId: "student-3", displayName: "외부 학생" },
        ],
        "student-1",
        roster,
      ),
    ).toEqual({ ok: false, error: "student_not_in_classroom" });
  });
});
