-- Allow inspection findings to be recorded by either a student role holder or
-- the classroom teacher. Existing student-reported rows keep reporterId.

ALTER TABLE "CleaningFinding" ADD COLUMN "reporterUserId" TEXT;
ALTER TABLE "ShoeFinding" ADD COLUMN "reporterUserId" TEXT;

ALTER TABLE "CleaningFinding" ALTER COLUMN "reporterId" DROP NOT NULL;
ALTER TABLE "ShoeFinding" ALTER COLUMN "reporterId" DROP NOT NULL;

CREATE INDEX "CleaningFinding_reporterUserId_idx" ON "CleaningFinding"("reporterUserId");
CREATE INDEX "ShoeFinding_reporterUserId_idx" ON "ShoeFinding"("reporterUserId");

ALTER TABLE "CleaningFinding" ADD CONSTRAINT "CleaningFinding_reporterUserId_fkey"
  FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShoeFinding" ADD CONSTRAINT "ShoeFinding_reporterUserId_fkey"
  FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
