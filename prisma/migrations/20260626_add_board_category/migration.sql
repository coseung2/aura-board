-- Add BoardCategory enum and Board.category column.
-- Existing boards default to LESSON; later backfill to PLAY can be done from UI.
CREATE TYPE "BoardCategory" AS ENUM ('LESSON', 'PLAY');

ALTER TABLE "Board" ADD COLUMN "category" "BoardCategory" NOT NULL DEFAULT 'LESSON';

-- Speed up the new dashboard filter (classroomId + category).
CREATE INDEX "Board_classroomId_category_idx" ON "Board" ("classroomId", "category");