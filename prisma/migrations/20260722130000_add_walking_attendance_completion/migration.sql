-- Health Connect syncs make a day eligible for the walking attendance
-- mission; this nullable marker is set only after the student checks in.
ALTER TABLE "StudentWalkingDailyStat"
  ADD COLUMN "attendanceCompletedAt" TIMESTAMP(3);

