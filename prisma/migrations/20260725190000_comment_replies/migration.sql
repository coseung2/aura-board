-- Flat reply threads for card comments. Replies to replies are normalized to
-- the same root by the API, which keeps the UI at one indentation level.
ALTER TABLE "CardComment"
  ADD COLUMN "parentCommentId" TEXT;

CREATE INDEX "CardComment_parentCommentId_createdAt_idx"
  ON "CardComment"("parentCommentId", "createdAt");

ALTER TABLE "CardComment"
  ADD CONSTRAINT "CardComment_parentCommentId_fkey"
  FOREIGN KEY ("parentCommentId") REFERENCES "CardComment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
