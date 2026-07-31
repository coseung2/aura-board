-- Add leased claims, retry backoff, and terminal state without recreating the
-- queue. Existing rows and the original indexes are intentionally preserved.
ALTER TABLE public."BlobDeletionQueue"
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "status" TEXT,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "lockToken" TEXT,
  ADD COLUMN "terminal" BOOLEAN;

UPDATE public."BlobDeletionQueue"
SET "nextAttemptAt" = CASE
      WHEN "deletedAt" IS NULL THEN "deleteAfter"
      ELSE COALESCE("deletedAt", "deleteAfter")
    END,
    "status" = CASE WHEN "deletedAt" IS NULL THEN 'pending' ELSE 'done' END,
    "terminal" = ("deletedAt" IS NOT NULL);

ALTER TABLE public."BlobDeletionQueue"
  ALTER COLUMN "nextAttemptAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "nextAttemptAt" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'pending',
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "terminal" SET DEFAULT false,
  ALTER COLUMN "terminal" SET NOT NULL;

ALTER TABLE public."BlobDeletionQueue"
  ADD CONSTRAINT "BlobDeletionQueue_status_check"
    CHECK ("status" IN ('pending', 'processing', 'done', 'dead')),
  ADD CONSTRAINT "BlobDeletionQueue_attempts_check"
    CHECK ("attempts" >= 0);

CREATE INDEX "BlobDeletionQueue_status_nextAttemptAt_createdAt_idx"
  ON public."BlobDeletionQueue"("status", "nextAttemptAt", "createdAt");

-- This table is server-consumed and must remain closed to browser roles in the
-- exposed public schema. The earlier RLS migration already enables it; this is
-- intentionally idempotent and does not replace or disable the setting.
ALTER TABLE public."BlobDeletionQueue" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."BlobDeletionQueue" FROM anon, authenticated;
