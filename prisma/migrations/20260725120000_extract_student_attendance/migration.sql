-- Attendance is a student-app concern, not a walking-stat attribute. Preserve
-- every historical visit and its stable monthly ordinal before removing the
-- walking-specific columns.
CREATE TABLE "StudentAttendance" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "month" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudentAttendance_pkey" PRIMARY KEY ("id")
);

INSERT INTO "StudentAttendance" (
  "id", "studentId", "day", "month", "ordinal", "visitedAt", "createdAt"
)
SELECT
  CONCAT('legacy-attendance-', stat."id"),
  stat."studentId",
  stat."day",
  COALESCE(stat."attendanceMonth", TO_CHAR(stat."day", 'YYYY-MM')),
  stat."attendanceOrdinal",
  COALESCE(stat."attendanceVisitedAt", stat."attendanceCompletedAt", stat."updatedAt"),
  stat."createdAt"
FROM "StudentWalkingDailyStat" AS stat
WHERE stat."attendanceVisitedAt" IS NOT NULL
  AND stat."attendanceOrdinal" IS NOT NULL
  AND stat."attendanceOrdinal" BETWEEN 1 AND 28
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "StudentAttendance_studentId_day_key"
  ON "StudentAttendance"("studentId", "day");
CREATE UNIQUE INDEX "StudentAttendance_studentId_month_ordinal_key"
  ON "StudentAttendance"("studentId", "month", "ordinal");
CREATE INDEX "StudentAttendance_studentId_month_idx"
  ON "StudentAttendance"("studentId", "month");

ALTER TABLE "StudentAttendance"
  ADD CONSTRAINT "StudentAttendance_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Attendance payout source names now describe the shared domain. The source
-- references are intentionally unchanged, preserving payout idempotency.
UPDATE "Transaction"
SET "sourceType" = 'attendance_reward'
WHERE "sourceType" = 'walking_weekly_reward'
  AND "sourceRef" LIKE '%:attendance:%'
  AND "type" = 'deposit';

UPDATE "Transaction"
SET "sourceType" = 'attendance_cookie_reward'
WHERE "sourceType" = 'walking_attendance_cookie_reward'
  AND "sourceRef" LIKE '%:attendance:%:cookie'
  AND "type" = 'item_grant';

UPDATE "CreatureProgressEvent"
SET "sourceType" = 'attendance_reward'
WHERE "sourceType" = 'walking_weekly_reward'
  AND "sourceRef" LIKE '%:attendance:%';

-- Keep the legacy columns for one deployment window so older mobile clients
-- can still read their last snapshot. New code no longer writes or reads them.
