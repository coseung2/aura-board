-- Media preview and delayed Blob cleanup.
ALTER TABLE "CardAttachment" ADD COLUMN "previewUrl" TEXT;

CREATE TABLE "BlobDeletionQueue" (
  "id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "deleteAfter" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlobDeletionQueue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BlobDeletionQueue_deleteAfter_deletedAt_idx" ON "BlobDeletionQueue"("deleteAfter", "deletedAt");
CREATE INDEX "BlobDeletionQueue_url_idx" ON "BlobDeletionQueue"("url");

CREATE TABLE "PreviewFetchCache" (
  "key" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "payload" JSONB,
  "error" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PreviewFetchCache_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "PreviewFetchCache_kind_expiresAt_idx" ON "PreviewFetchCache"("kind", "expiresAt");
CREATE INDEX "PreviewFetchCache_url_idx" ON "PreviewFetchCache"("url");
