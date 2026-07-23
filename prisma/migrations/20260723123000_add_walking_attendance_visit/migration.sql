-- Keep attendance eligibility separate from reward collection so a student
-- can claim a missed visit reward on a later day.
ALTER TABLE "StudentWalkingDailyStat"
  ADD COLUMN "attendanceVisitedAt" TIMESTAMP(3),
  ADD COLUMN "attendanceMonth" TEXT,
  ADD COLUMN "attendanceOrdinal" INTEGER;

-- Preserve already completed attendance as an eligible historical visit.
UPDATE "StudentWalkingDailyStat"
SET "attendanceVisitedAt" = "attendanceCompletedAt",
    "attendanceMonth" = TO_CHAR("day", 'YYYY-MM')
WHERE "attendanceCompletedAt" IS NOT NULL;

WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "studentId", "attendanceMonth"
           ORDER BY "day" ASC
         ) AS ordinal
  FROM "StudentWalkingDailyStat"
  WHERE "attendanceVisitedAt" IS NOT NULL
)
UPDATE "StudentWalkingDailyStat" AS stat
SET "attendanceOrdinal" = ranked.ordinal
FROM ranked
WHERE stat."id" = ranked."id";

CREATE UNIQUE INDEX "StudentWalkingDailyStat_attendance_ordinal_key"
  ON "StudentWalkingDailyStat"("studentId", "attendanceMonth", "attendanceOrdinal");
