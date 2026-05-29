import { describe, it, expect } from "vitest";
import {
  canStudentSubmit,
  computeTeacherTransition,
  computeStudentSubmit,
} from "../assignment-state";

const NOW = new Date("2026-04-15T12:00:00Z");
const PAST = new Date("2026-04-10T00:00:00Z");
const FUTURE = new Date("2026-04-20T00:00:00Z");

describe("canStudentSubmit", () => {
  it("no deadline + not_graded → allowed", () => {
    expect(
      canStudentSubmit(
        { submissionStatus: "assigned", gradingStatus: "not_graded" },
        { assignmentAllowLate: false, assignmentDeadline: null },
        NOW
      )
    ).toBe(true);
  });

  it("deadline future + not_graded → allowed", () => {
    expect(
      canStudentSubmit(
        { submissionStatus: "assigned", gradingStatus: "not_graded" },
        { assignmentAllowLate: false, assignmentDeadline: FUTURE },
        NOW
      )
    ).toBe(true);
  });

  it("deadline past + allowLate=true → allowed", () => {
    expect(
      canStudentSubmit(
        { submissionStatus: "assigned", gradingStatus: "not_graded" },
        { assignmentAllowLate: true, assignmentDeadline: PAST },
        NOW
      )
    ).toBe(true);
  });

  it("deadline past + allowLate=false → blocked", () => {
    expect(
      canStudentSubmit(
        { submissionStatus: "assigned", gradingStatus: "not_graded" },
        { assignmentAllowLate: false, assignmentDeadline: PAST },
        NOW
      )
    ).toBe(false);
  });

  it("gradingStatus=graded → blocked regardless", () => {
    expect(
      canStudentSubmit(
        { submissionStatus: "submitted", gradingStatus: "graded" },
        { assignmentAllowLate: true, assignmentDeadline: FUTURE },
        NOW
      )
    ).toBe(false);
  });

  it("gradingStatus=released → blocked", () => {
    expect(
      canStudentSubmit(
        { submissionStatus: "reviewed", gradingStatus: "released" },
        { assignmentAllowLate: true, assignmentDeadline: FUTURE },
        NOW
      )
    ).toBe(false);
  });

  it("orphaned → blocked", () => {
    expect(
      canStudentSubmit(
        { submissionStatus: "orphaned", gradingStatus: "not_graded" },
        { assignmentAllowLate: true, assignmentDeadline: null },
        NOW
      )
    ).toBe(false);
  });
});

describe("computeTeacherTransition — open", () => {
  it("submitted → viewed stamps viewedAt", () => {
    const result = computeTeacherTransition(
      { submissionStatus: "submitted", gradingStatus: "not_graded" },
      { transition: "open" },
      NOW
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.next.submissionStatus).toBe("viewed");
  });

  it("submitted → viewedAt present", () => {
    const result = computeTeacherTransition(
      { submissionStatus: "submitted", gradingStatus: "not_graded" },
      { transition: "open" },
      NOW
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.next.viewedAt instanceof Date).toBe(true);
  });

  it("viewed stays viewed (idempotent)", () => {
    const result = computeTeacherTransition(
      { submissionStatus: "viewed", gradingStatus: "not_graded" },
      { transition: "open" },
      NOW
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.next.submissionStatus).toBe("viewed");
  });

  it("assigned → invalid_transition", () => {
    const result = computeTeacherTransition(
      { submissionStatus: "assigned", gradingStatus: "not_graded" },
      { transition: "open" },
      NOW
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_transition");
  });
});

describe("computeTeacherTransition — return", () => {
  it("viewed → returned", () => {
    const result = computeTeacherTransition(
      { submissionStatus: "viewed", gradingStatus: "not_graded" },
      { transition: "return", returnReason: "사진이 잘렸어요" },
      NOW
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.next.submissionStatus).toBe("returned");
  });

  it("resets gradingStatus to not_graded", () => {
    const result = computeTeacherTransition(
      { submissionStatus: "viewed", gradingStatus: "not_graded" },
      { transition: "return", returnReason: "사진이 잘렸어요" },
      NOW
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.next.gradingStatus).toBe("not_graded");
  });

  it("returnReason persisted", () => {
    const result = computeTeacherTransition(
      { submissionStatus: "viewed", gradingStatus: "not_graded" },
      { transition: "return", returnReason: "사진이 잘렸어요" },
      NOW
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.next.returnReason).toBe("사진이 잘렸어요");
  });

  it("assigned → invalid_transition", () => {
    const result = computeTeacherTransition(
      { submissionStatus: "assigned", gradingStatus: "not_graded" },
      { transition: "return", returnReason: "x" },
      NOW
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_transition");
  });
});

describe("computeTeacherTransition — review", () => {
  it("viewed → reviewed", () => {
    const result = computeTeacherTransition(
      { submissionStatus: "viewed", gradingStatus: "not_graded" },
      { transition: "review" },
      NOW
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.next.submissionStatus).toBe("reviewed");
  });

  it("assigned → invalid_transition", () => {
    const result = computeTeacherTransition(
      { submissionStatus: "assigned", gradingStatus: "not_graded" },
      { transition: "review" },
      NOW
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false).toBe(true);
  });
});

describe("computeTeacherTransition — grade", () => {
  it("submitted → gradingStatus=graded, grade=A+", () => {
    const result = computeTeacherTransition(
      { submissionStatus: "submitted", gradingStatus: "not_graded" },
      { transition: "grade", grade: "A+" },
      NOW
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.next.gradingStatus).toBe("graded");
      expect(result.next.grade).toBe("A+");
    }
  });

  it("submissionStatus unchanged", () => {
    const result = computeTeacherTransition(
      { submissionStatus: "submitted", gradingStatus: "not_graded" },
      { transition: "grade", grade: "A+" },
      NOW
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.next.submissionStatus).toBe("submitted");
  });

  it("orphaned → invalid_transition", () => {
    const result = computeTeacherTransition(
      { submissionStatus: "orphaned", gradingStatus: "not_graded" },
      { transition: "grade", grade: "B" },
      NOW
    );
    expect(result.ok).toBe(false);
  });
});

describe("computeStudentSubmit", () => {
  it("assigned → submitted", () => {
    expect(computeStudentSubmit("assigned")).toEqual({
      ok: true,
      next: "submitted",
    });
  });

  it("returned → submitted", () => {
    expect(computeStudentSubmit("returned")).toEqual({
      ok: true,
      next: "submitted",
    });
  });

  it("submitted → submitted (overwrite)", () => {
    expect(computeStudentSubmit("submitted")).toEqual({
      ok: true,
      next: "submitted",
    });
  });

  it("orphaned → blocked", () => {
    expect(computeStudentSubmit("orphaned")).toEqual({
      ok: false,
      next: "orphaned",
    });
  });
});
