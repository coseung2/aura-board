CREATE TABLE "SongGuessImport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "boardId" TEXT NOT NULL REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "requestedByUserId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "startSeconds" INTEGER NOT NULL CHECK ("startSeconds" BETWEEN 0 AND 86400),
  "sourceUrl" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued','processing','ready','failed')),
  "title" TEXT NOT NULL DEFAULT '', "artist" TEXT NOT NULL DEFAULT '', "error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3),
  "objectKey" TEXT, "sizeBytes" INTEGER, "sha256" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "SongGuessImport_boardId_videoId_startSeconds_key" ON "SongGuessImport"("boardId","videoId","startSeconds");
CREATE UNIQUE INDEX "SongGuessImport_objectKey_key" ON "SongGuessImport"("objectKey");
CREATE INDEX "SongGuessImport_status_leaseUntil_createdAt_idx" ON "SongGuessImport"("status","leaseUntil","createdAt");
CREATE INDEX "SongGuessImport_boardId_createdAt_idx" ON "SongGuessImport"("boardId","createdAt");
ALTER TABLE "SongGuessImport" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SongGuessImport" FROM anon, authenticated;
GRANT ALL ON "SongGuessImport" TO service_role;
