CREATE TABLE "StudentWalkingDailyStat" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "steps" INTEGER NOT NULL DEFAULT 0,
  "distanceMeters" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'health_connect',
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudentWalkingDailyStat_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentWalkingDailyStat_steps_check"
    CHECK ("steps" >= 0 AND "steps" <= 200000),
  CONSTRAINT "StudentWalkingDailyStat_distanceMeters_check"
    CHECK ("distanceMeters" >= 0 AND "distanceMeters" <= 300000),
  CONSTRAINT "StudentWalkingDailyStat_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- This table is accessed only through authenticated server-side Prisma routes.
-- Keep it closed to direct Supabase Data API access, matching the other
-- server-owned public tables in this project.
ALTER TABLE public."StudentWalkingDailyStat" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "StudentWalkingDailyStat_studentId_day_key"
  ON "StudentWalkingDailyStat"("studentId", "day");

CREATE INDEX "StudentWalkingDailyStat_day_idx"
  ON "StudentWalkingDailyStat"("day");

CREATE INDEX "StudentWalkingDailyStat_studentId_syncedAt_idx"
  ON "StudentWalkingDailyStat"("studentId", "syncedAt");
