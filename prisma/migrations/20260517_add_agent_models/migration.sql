-- Agent Service Phase 0: student-scoped AI chat sessions/messages.
-- Idempotent because the schema may already have been applied with `prisma db push`.

CREATE TABLE IF NOT EXISTS "AgentSession" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "classroomId" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'arcade',
  "title" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'active',
  "projectId" TEXT,
  "tokenCount" INTEGER NOT NULL DEFAULT 0,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentMessage" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "tokenCount" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AgentSession_studentId_fkey'
  ) THEN
    ALTER TABLE "AgentSession"
      ADD CONSTRAINT "AgentSession_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AgentSession_projectId_fkey'
  ) THEN
    ALTER TABLE "AgentSession"
      ADD CONSTRAINT "AgentSession_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "VibeProject"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AgentMessage_sessionId_fkey'
  ) THEN
    ALTER TABLE "AgentMessage"
      ADD CONSTRAINT "AgentMessage_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AgentSession_studentId_status_idx" ON "AgentSession"("studentId", "status");
CREATE INDEX IF NOT EXISTS "AgentSession_studentId_createdAt_idx" ON "AgentSession"("studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentSession_classroomId_createdAt_idx" ON "AgentSession"("classroomId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentMessage_sessionId_createdAt_idx" ON "AgentMessage"("sessionId", "createdAt");
