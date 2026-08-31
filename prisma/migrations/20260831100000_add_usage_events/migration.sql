-- Product usage telemetry for administrator usage analytics.
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "userId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'user',
    "source" TEXT NOT NULL DEFAULT 'web',
    "classroomId" TEXT,
    "boardId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");
CREATE INDEX "UsageEvent_eventName_createdAt_idx" ON "UsageEvent"("eventName", "createdAt");
CREATE INDEX "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt");
CREATE INDEX "UsageEvent_source_createdAt_idx" ON "UsageEvent"("source", "createdAt");
CREATE INDEX "UsageEvent_classroomId_createdAt_idx" ON "UsageEvent"("classroomId", "createdAt");
CREATE INDEX "UsageEvent_boardId_createdAt_idx" ON "UsageEvent"("boardId", "createdAt");

ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
