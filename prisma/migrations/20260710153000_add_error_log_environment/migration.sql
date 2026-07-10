ALTER TABLE "ErrorLog"
    ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX "ErrorLog_environment_createdAt_idx"
    ON "ErrorLog"("environment", "createdAt");
