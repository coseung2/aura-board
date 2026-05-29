import type {
  AssignmentSubmissionStatus,
  AssignmentGradingStatus,
  SlotTransitionInput,
} from "./assignment-schemas";

/**
 * Assignment-board state machine (AB-1).
 *
 * Single source of truth for teacher/student transition rules. Duplicated
 * checks on the API route are the enforcement layer; this module is pure and
 * pure-import-safe so it can also be pulled into React client components for
 * optimistic UI hints.
 */

export type SlotSnapshot = {
  submissionStatus: AssignmentSubmissionStatus;
  gradingStatus: AssignmentGradingStatus;
};

export type BoardDeadlineSnapshot = {
  assignmentAllowLate: boolean;
  assignmentDeadline: Date | null;
};

/** Is a student currently allowed to submit / overwrite? */
export function canStudentSubmit(
  slot: SlotSnapshot,
  board: BoardDeadlineSnapshot,
  now: Date = new Date()
): boolean {
  if (slot.submissionStatus === "orphaned") return false;
  // Graded/released locks further edits regardless of deadline.
  if (slot.gradingStatus !== "not_graded") return false;
  const deadline = board.assignmentDeadline;
  if (!deadline) return true;
  if (now.getTime() <= deadline.getTime()) return true;
  return board.assignmentAllowLate;
}

type TransitionResult =
  | {
      ok: true;
      next: {
        submissionStatus: AssignmentSubmissionStatus;
        gradingStatus: AssignmentGradingStatus;
        viewedAt?: Date;
        returnedAt?: Date;
        returnReason?: string | null;
        grade?: string | null;
      };
    }
  | { ok: false; code: "invalid_transition"; from: AssignmentSubmissionStatus };

/**
 * Teacher-side transition computation. Does NOT mutate DB — returns the
 * patch that the route handler must apply. API layer guards auth; this
 * guards state-legality.
 */
export function computeTeacherTransition(
  slot: SlotSnapshot,
  input: SlotTransitionInput,
  now: Date = new Date()
): TransitionResult {
  const from = slot.submissionStatus;

  switch (input.transition) {
    case "open":
      // submitted/returned/reviewed all idempotently stamp viewedAt and may
      // transition submitted→viewed. Other from-states are errors.
      if (from === "submitted") {
        return {
          ok: true,
          next: { submissionStatus: "viewed", gradingStatus: slot.gradingStatus, viewedAt: now },
        };
      }
      if (from === "viewed" || from === "returned" || from === "reviewed") {
        return {
          ok: true,
          next: { submissionStatus: from, gradingStatus: slot.gradingStatus, viewedAt: now },
        };
      }
      return { ok: false, code: "invalid_transition", from };

    case "return":
      if (from === "submitted" || from === "viewed" || from === "reviewed") {
        return {
          ok: true,
          next: {
            submissionStatus: "returned",
            gradingStatus: "not_graded",
            returnedAt: now,
            returnReason: input.returnReason,
          },
        };
      }
      return { ok: false, code: "invalid_transition", from };

    case "review":
      if (from === "viewed" || from === "submitted") {
        return {
          ok: true,
          next: { submissionStatus: "reviewed", gradingStatus: slot.gradingStatus },
        };
      }
      return { ok: false, code: "invalid_transition", from };

    case "grade":
      if (from === "orphaned") {
        return { ok: false, code: "invalid_transition", from };
      }
      return {
        ok: true,
        next: {
          submissionStatus: from,
          gradingStatus: input.gradingStatus ?? "graded",
          grade: input.grade,
        },
      };
    default: {
      // Exhaustive check — catches any new transition type at compile time.
      const _exhaustive: never = input.transition;
      return _exhaustive;
    }
  }
}

/**
 * Student re-submission transition: assigned→submitted or returned→submitted.
 * Never touches gradingStatus except to reset from implicit "not_graded" — the
 * gradingStatus gate is enforced upstream via canStudentSubmit().
 */
export function computeStudentSubmit(from: AssignmentSubmissionStatus): {
  ok: boolean;
  next: AssignmentSubmissionStatus;
} {
  if (from === "assigned" || from === "returned") {
    return { ok: true, next: "submitted" };
  }
  if (from === "submitted" || from === "viewed" || from === "reviewed") {
    // Re-submission before teacher action is allowed — overwrite in place,
    // but do not "downgrade" a reviewed state via submit. The API layer
    // additionally checks gradingStatus.
    return { ok: true, next: "submitted" };
  }
  return { ok: false, next: from };
}
