export type AssignmentDeadlineInput = {
  slotDueAt: Date | null;
  boardDeadline?: Date | null;
};

/** Slot snapshots are authoritative; boardDeadline only preserves legacy locking. */
export function effectiveAssignmentDeadline(input: AssignmentDeadlineInput): Date | null {
  return input.slotDueAt ?? input.boardDeadline ?? null;
}

/** Equal-to-deadline is on time. Missing legacy deadlines fail closed for rewards. */
export function isAssignmentSubmissionOnTime(
  dueAt: Date | null,
  submittedAt: Date,
): boolean {
  return dueAt !== null && submittedAt.getTime() <= dueAt.getTime();
}

export function assignmentSubmissionRewardSourceRef(
  studentId: string,
  slotId: string,
  attemptId: string,
): string {
  return `${studentId}:${slotId}:attempt:${attemptId}`;
}
