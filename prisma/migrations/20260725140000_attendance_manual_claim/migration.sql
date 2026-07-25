-- Attendance rewards are claimed by the student per ordinal, so a visit and its
-- payout are separate states again. Rows created while payouts were automatic
-- are backfilled as claimed so no reward can be granted twice.
ALTER TABLE "StudentAttendance" ADD COLUMN "claimedAt" TIMESTAMP(3);

UPDATE "StudentAttendance" AS attendance
SET "claimedAt" = attendance."visitedAt"
WHERE EXISTS (
  SELECT 1
  FROM "Transaction" AS tx
  WHERE tx."sourceType" IN ('attendance_reward', 'attendance_cookie_reward')
    AND tx."sourceRef" IN (
      CONCAT(attendance."studentId", ':', attendance."month", ':attendance:', attendance."ordinal"),
      CONCAT(attendance."studentId", ':', attendance."month", ':attendance:', attendance."ordinal", ':cookie')
    )
);
