-- Durable snapshots of reading log content and evaluation before edits.
ALTER TABLE "ReadingLog" ADD COLUMN "currentRevision" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "ReadingLogRevision" (
    "id" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "bookType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "reflection" TEXT NOT NULL,
    "aiScore" INTEGER,
    "aiFeedback" TEXT,
    "aiFeedbackStatus" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReadingLogRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReadingLogRevision_logId_revision_key"
    ON "ReadingLogRevision"("logId", "revision");

CREATE INDEX "ReadingLogRevision_logId_createdAt_idx"
    ON "ReadingLogRevision"("logId", "createdAt");

ALTER TABLE "ReadingLogRevision"
    ADD CONSTRAINT "ReadingLogRevision_logId_fkey"
    FOREIGN KEY ("logId") REFERENCES "ReadingLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
