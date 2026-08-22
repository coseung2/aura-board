ALTER TABLE "ReadingLog"
ADD COLUMN "missionCounted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "missionCountedAt" TIMESTAMP(3);

-- Preserve historical generated approvals without creating rewards or changing claims.
UPDATE "ReadingLog"
SET "missionCounted" = true,
    "missionCountedAt" = "evaluatedAt"
WHERE "aiScore" >= 5
  AND "aiFeedbackStatus" = 'generated';
