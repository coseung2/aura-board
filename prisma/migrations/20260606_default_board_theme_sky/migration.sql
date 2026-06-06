-- Make pastel sky the default board background and migrate legacy white boards.
ALTER TABLE "Board"
ADD COLUMN IF NOT EXISTS "boardTheme" TEXT NOT NULL DEFAULT 'pastel-sky';

UPDATE "Board"
SET "boardTheme" = 'pastel-sky'
WHERE "boardTheme" IS NULL OR "boardTheme" = 'plain';

ALTER TABLE "Board"
ALTER COLUMN "boardTheme" SET DEFAULT 'pastel-sky';
