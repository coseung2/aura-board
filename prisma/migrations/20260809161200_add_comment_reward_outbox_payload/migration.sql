-- Snapshot the minimal immutable reward event at comment commit time. This
-- keeps reward delivery independent from later soft/hard comment deletion.
BEGIN;

-- Hold inserts from the historical snapshot through trigger replacement. The
-- table is small and the backfill is bounded, so this closes the only window
-- where an old-trigger comment could miss both the backfill and reward event.
LOCK TABLE public."CardComment" IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public."NotificationOutbox"
  ADD COLUMN "payload" JSONB;

-- Permanent server-only duplicate ledger. There is deliberately no comment or
-- card FK: deleting content must not erase a prior reward claim. Student
-- deletion still removes the pseudonymous ledger row.
CREATE TABLE public."CommentRewardClaim" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "normalizedHash" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommentRewardClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommentRewardClaim_studentId_normalizedHash_key"
  ON public."CommentRewardClaim"("studentId", "normalizedHash");
CREATE UNIQUE INDEX "CommentRewardClaim_commentId_key"
  ON public."CommentRewardClaim"("commentId");
CREATE INDEX "CommentRewardClaim_createdAt_idx"
  ON public."CommentRewardClaim"("createdAt");

ALTER TABLE public."CommentRewardClaim"
  ADD CONSTRAINT "CommentRewardClaim_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES public."Student"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."CommentRewardClaim" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CommentRewardClaim" FROM anon, authenticated;

-- Preserve the existing duplicate contract without issuing historical reward
-- events. Deleted comments remain duplicate evidence just as they were in the
-- synchronous path; only the earliest normalized comment owns the claim.
WITH normalized AS (
  SELECT
    c."id" AS "commentId",
    c."authorStudentId" AS "studentId",
    c."createdAt" AS "occurredAt",
    encode(
      extensions.digest(
        convert_to(
          regexp_replace(
            btrim(normalize(c."content", NFKC)),
            '[[:space:]]+',
            ' ',
            'g'
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) AS "normalizedHash"
  FROM public."CardComment" c
  WHERE c."authorKind"::text = 'student'
    AND c."authorStudentId" IS NOT NULL
), earliest AS (
  SELECT DISTINCT ON ("studentId", "normalizedHash")
    "commentId", "studentId", "occurredAt", "normalizedHash"
  FROM normalized
  ORDER BY "studentId", "normalizedHash", "occurredAt", "commentId"
)
INSERT INTO public."CommentRewardClaim" (
  "id", "studentId", "normalizedHash", "commentId", "occurredAt", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  "studentId",
  "normalizedHash",
  "commentId",
  "occurredAt",
  CURRENT_TIMESTAMP
FROM earliest;

CREATE OR REPLACE FUNCTION private.enqueue_card_comment_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_content text;
  normalized_hash text;
  reward_claim_id text;
BEGIN
  reward_claim_id := NULL;
  IF NEW."authorKind"::text = 'student' AND NEW."authorStudentId" IS NOT NULL THEN
    normalized_content := regexp_replace(
      btrim(normalize(NEW."content", NFKC)),
      '[[:space:]]+',
      ' ',
      'g'
    );
    normalized_hash := encode(
      extensions.digest(convert_to(normalized_content, 'UTF8'), 'sha256'),
      'hex'
    );

    INSERT INTO public."CommentRewardClaim" (
      "id", "studentId", "normalizedHash", "commentId", "occurredAt", "createdAt"
    ) VALUES (
      gen_random_uuid()::text,
      NEW."authorStudentId",
      normalized_hash,
      NEW."id",
      NEW."createdAt",
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("studentId", "normalizedHash") DO NOTHING
    RETURNING "id" INTO reward_claim_id;
  END IF;

  -- One outbox INSERT keeps the statement-level pg_net wakeup coalesced to a
  -- single request even when both notification and reward events are emitted.
  INSERT INTO public."NotificationOutbox" (
    "id", "eventType", "sourceId", "payload", "status", "attempts",
    "nextAttemptAt", "createdAt", "updatedAt"
  )
  SELECT
    gen_random_uuid()::text,
    'card_comment',
    NEW."id",
    NULL::jsonb,
    'pending',
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  UNION ALL
  SELECT
    gen_random_uuid()::text,
    'comment_reward',
    NEW."id",
    jsonb_build_object(
      'version', 1,
      'claimId', reward_claim_id,
      'commentId', NEW."id",
      'authorKind', NEW."authorKind"::text,
      'authorStudentId', NEW."authorStudentId",
      'normalizedContent', normalized_content,
      -- Prisma persists UTC instants in timestamp-without-time-zone columns.
      -- Serialize an explicit UTC designator so Node parsing cannot depend on
      -- the Oracle host process timezone at KST day/week boundaries.
      'occurredAt', to_char(
        NEW."createdAt",
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    ),
    'pending',
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  WHERE reward_claim_id IS NOT NULL
  ON CONFLICT ("eventType", "sourceId") DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_card_comment_outbox() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enqueue_card_comment_outbox() FROM anon, authenticated;

DROP TRIGGER IF EXISTS "notification_outbox_card_comment_insert"
  ON public."CardComment";
CREATE TRIGGER "notification_outbox_card_comment_insert"
AFTER INSERT ON public."CardComment"
FOR EACH ROW EXECUTE FUNCTION private.enqueue_card_comment_outbox();

COMMIT;
