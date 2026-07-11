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
  CONSTRAINT "StudentWalkingDailyStat_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StudentWalkingDailyStat_studentId_day_key"
  ON "StudentWalkingDailyStat"("studentId", "day");

CREATE INDEX "StudentWalkingDailyStat_day_idx"
  ON "StudentWalkingDailyStat"("day");

CREATE INDEX "StudentWalkingDailyStat_studentId_syncedAt_idx"
  ON "StudentWalkingDailyStat"("studentId", "syncedAt");
