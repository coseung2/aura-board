import { describe, expect, it } from "vitest";
import {
  assignmentSubmissionRewardSourceRef,
  effectiveAssignmentDeadline,
  isAssignmentSubmissionOnTime,
} from "./assignment-submission";
import { AssignmentDistributionSchema, StudentSubmitSchema } from "./assignment-schemas";

describe("assignment submission deadline policy", () => {
  const dueAt = new Date("2026-07-20T12:00:00.000Z");

  it("accepts the exact deadline and rejects one millisecond late", () => {
    expect(isAssignmentSubmissionOnTime(dueAt, new Date(dueAt))).toBe(true);
    expect(isAssignmentSubmissionOnTime(dueAt, new Date(dueAt.getTime() + 1))).toBe(false);
  });

  it("fails closed for a legacy slot without a deadline", () => {
    expect(isAssignmentSubmissionOnTime(null, new Date())).toBe(false);
  });

  it("uses the immutable slot snapshot before the legacy board deadline", () => {
    const boardDeadline = new Date("2026-07-21T12:00:00.000Z");
    expect(effectiveAssignmentDeadline({ slotDueAt: dueAt, boardDeadline })).toBe(dueAt);
    expect(effectiveAssignmentDeadline({ slotDueAt: null, boardDeadline })).toBe(boardDeadline);
  });

  it("namespaces each accepted attempt independently", () => {
    expect(assignmentSubmissionRewardSourceRef("student-1", "slot-1", "attempt-2")).toBe(
      "student-1:slot-1:attempt:attempt-2",
    );
  });

  it("requires an offset-aware dueAt and submission idempotency key", () => {
    expect(AssignmentDistributionSchema.safeParse({}).success).toBe(false);
    expect(AssignmentDistributionSchema.safeParse({ dueAt: "2026-07-20T21:00:00" }).success).toBe(false);
    expect(
      AssignmentDistributionSchema.parse({ dueAt: "2026-07-20T21:00:00+09:00" }).dueAt,
    ).toBe("2026-07-20T21:00:00+09:00");
    expect(StudentSubmitSchema.safeParse({ content: "완료" }).success).toBe(false);
  });
});
