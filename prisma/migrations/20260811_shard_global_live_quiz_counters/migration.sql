-- A global Live Quiz question can receive every participant's answer at once.
-- Keep answer writes append-only and spread aggregate updates over 128 rows so
-- they do not all wait on one question counter tuple.
BEGIN;

-- SHARE ROW EXCLUSIVE conflicts with the ROW EXCLUSIVE lock taken by INSERT.
-- Holding it through backfill and trigger replacement closes the cutover gap:
-- every committed answer is either in the backfill or reaches the new trigger.
LOCK TABLE "LiveQuizAnswer" IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE "LiveQuizQuestionCounterShard" (
  "sessionKey" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "shard" INTEGER NOT NULL,
  "answerCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LiveQuizQuestionCounterShard_pkey"
    PRIMARY KEY ("sessionKey", "questionId", "shard"),
  CONSTRAINT "LiveQuizQuestionCounterShard_shard_check"
    CHECK ("shard" BETWEEN 0 AND 127),
  CONSTRAINT "LiveQuizQuestionCounterShard_answer_count_check"
    CHECK ("answerCount" >= 0)
);

CREATE FUNCTION "liveQuizCounterShard"(participant_type TEXT, participant_id TEXT)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT (
    ('x' || substr(md5(participant_type || ':' || participant_id), 1, 8))::bit(32)::bigint
    % 128
  )::integer
$$;

INSERT INTO "LiveQuizQuestionCounterShard" (
  "sessionKey", "questionId", "shard", "answerCount", "updatedAt"
)
SELECT
  session."sessionKey",
  answer."questionId",
  "liveQuizCounterShard"(answer."participantType", answer."participantId"),
  COUNT(*)::integer,
  clock_timestamp()
FROM "LiveQuizAnswer" AS answer
JOIN "LiveQuizSession" AS session ON session."id" = answer."sessionId"
GROUP BY
  session."sessionKey",
  answer."questionId",
  "liveQuizCounterShard"(answer."participantType", answer."participantId");

CREATE FUNCTION "incrementLiveQuizQuestionCounterShard"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public."LiveQuizQuestionCounterShard" (
    "sessionKey", "questionId", "shard", "answerCount", "updatedAt"
  )
  SELECT
    session."sessionKey",
    NEW."questionId",
    public."liveQuizCounterShard"(NEW."participantType", NEW."participantId"),
    1,
    clock_timestamp()
  FROM public."LiveQuizSession" AS session
  WHERE session."id" = NEW."sessionId"
  ON CONFLICT ("sessionKey", "questionId", "shard") DO UPDATE SET
    "answerCount" = "LiveQuizQuestionCounterShard"."answerCount" + 1,
    "updatedAt" = EXCLUDED."updatedAt";
  RETURN NEW;
END
$$;

DROP TRIGGER "LiveQuizAnswer_increment_realtime_counter" ON "LiveQuizAnswer";
DROP FUNCTION "incrementLiveQuizQuestionCounter"();
CREATE TRIGGER "LiveQuizAnswer_increment_realtime_counter_shard"
AFTER INSERT ON "LiveQuizAnswer"
FOR EACH ROW
EXECUTE FUNCTION "incrementLiveQuizQuestionCounterShard"();

ALTER TABLE "LiveQuizQuestionCounterShard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LiveQuizQuestionCounterShard" REPLICA IDENTITY FULL;
REVOKE ALL PRIVILEGES ON TABLE "LiveQuizQuestionCounterShard" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "LiveQuizQuestionCounter" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION
  "incrementLiveQuizQuestionCounterShard"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION
  "liveQuizCounterShard"(TEXT, TEXT) FROM PUBLIC;

CREATE POLICY "LiveQuizQuestionCounterShard_select"
ON "LiveQuizQuestionCounterShard"
FOR SELECT
TO PUBLIC
USING (true);

DROP POLICY IF EXISTS "LiveQuizQuestionCounter_select"
ON "LiveQuizQuestionCounter";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE SELECT ON TABLE public."LiveQuizQuestionCounter" FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public."LiveQuizQuestionCounterShard" FROM anon';
    EXECUTE 'GRANT SELECT ON TABLE public."LiveQuizQuestionCounterShard" TO anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION public."incrementLiveQuizQuestionCounterShard"() FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION public."liveQuizCounterShard"(TEXT, TEXT) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE SELECT ON TABLE public."LiveQuizQuestionCounter" FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public."LiveQuizQuestionCounterShard" FROM authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public."LiveQuizQuestionCounterShard" TO authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION public."incrementLiveQuizQuestionCounterShard"() FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION public."liveQuizCounterShard"(TEXT, TEXT) FROM authenticated';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'LiveQuizQuestionCounter'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public."LiveQuizQuestionCounter"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'LiveQuizQuestionCounterShard'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public."LiveQuizQuestionCounterShard"';
  END IF;
END
$$;

COMMIT;
