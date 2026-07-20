-- Deadline-aware assignment distribution and immutable submission attempts.
-- Existing slots intentionally keep dueAt NULL: legacy deadlines cannot be
-- inferred safely and therefore never become reward-eligible retroactively.
ALTER TABLE "AssignmentSlot"
  ADD COLUMN "dueAt" TIMESTAMP(3),
  ADD COLUMN "submissionRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AssignmentSubmissionAttempt" (
  "id" TEXT NOT NULL,
  "assignmentSlotId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedOnTime" BOOLEAN NOT NULL,

  CONSTRAINT "AssignmentSubmissionAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssignmentSubmissionAttempt_assignmentSlotId_idempotencyKey_key"
  ON "AssignmentSubmissionAttempt"("assignmentSlotId", "idempotencyKey");
CREATE UNIQUE INDEX "AssignmentSubmissionAttempt_assignmentSlotId_revision_key"
  ON "AssignmentSubmissionAttempt"("assignmentSlotId", "revision");
CREATE INDEX "AssignmentSubmissionAttempt_assignmentSlotId_submittedAt_idx"
  ON "AssignmentSubmissionAttempt"("assignmentSlotId", "submittedAt");

ALTER TABLE "AssignmentSubmissionAttempt"
  ADD CONSTRAINT "AssignmentSubmissionAttempt_assignmentSlotId_fkey"
  FOREIGN KEY ("assignmentSlotId") REFERENCES "AssignmentSlot"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
