CREATE TABLE "ErrorLog" (
    "id"        TEXT          NOT NULL,
    "userId"    TEXT,
    "userEmail" TEXT,
    "feature"   TEXT          NOT NULL,
    "path"      TEXT,
    "status"    INTEGER,
    "message"   TEXT          NOT NULL,
    "stack"     TEXT,
    "metadata"  JSONB,
    "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErrorLog_createdAt_idx"
    ON "ErrorLog"("createdAt");

CREATE INDEX "ErrorLog_feature_createdAt_idx"
    ON "ErrorLog"("feature", "createdAt");

CREATE INDEX "ErrorLog_userEmail_createdAt_idx"
    ON "ErrorLog"("userEmail", "createdAt");

CREATE INDEX "ErrorLog_status_createdAt_idx"
    ON "ErrorLog"("status", "createdAt");
