ALTER TABLE "Board"
ADD COLUMN "communityPublishedAt" TIMESTAMP(3);

CREATE INDEX "Board_communityPublishedAt_updatedAt_idx"
ON "Board"("communityPublishedAt", "updatedAt");
