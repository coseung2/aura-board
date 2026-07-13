-- Bind each OAuth token record to the Canva user and team that issued it.
ALTER TABLE "CanvaConnectAccount"
ADD COLUMN IF NOT EXISTS "canvaUserId" TEXT,
ADD COLUMN IF NOT EXISTS "canvaTeamId" TEXT;
