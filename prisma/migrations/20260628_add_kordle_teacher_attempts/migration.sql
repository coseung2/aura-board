ALTER TABLE "KordleAttempt" ADD COLUMN "teacherUserId" TEXT;

ALTER TABLE "KordleAttempt" ADD CONSTRAINT "KordleAttempt_teacherUserId_fkey"
  FOREIGN KEY ("teacherUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "KordleAttempt_teacherUserId_startedAt_idx"
  ON "KordleAttempt"("teacherUserId", "startedAt");

CREATE UNIQUE INDEX "KordleAttempt_puzzle_teacher_unique"
  ON "KordleAttempt"("puzzleId", "teacherUserId")
  WHERE "teacherUserId" IS NOT NULL;

ALTER TABLE "KordleAttempt" DROP CONSTRAINT IF EXISTS "KordleAttempt_has_player_check";

ALTER TABLE "KordleAttempt" ADD CONSTRAINT "KordleAttempt_has_player_check"
  CHECK (
    (CASE WHEN "studentId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "vibePlaySessionId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "teacherUserId" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
