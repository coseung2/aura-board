-- Global 13:30 KST live quiz. Internal tables are queried through Prisma's
-- parameterized raw-SQL API. Only the two safe projection tables at the bottom
-- are exposed to Supabase Realtime.

CREATE TABLE "LiveQuizQuestion" (
  "id" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "choices" JSONB NOT NULL,
  "correctChoice" INTEGER NOT NULL,
  "explanation" TEXT,
  "category" TEXT,
  "source" TEXT NOT NULL DEFAULT 'community',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "submitterType" TEXT NOT NULL,
  "submitterId" TEXT NOT NULL,
  "submitterName" TEXT NOT NULL,
  "submitterContext" TEXT,
  "reviewedById" TEXT,
  "reviewedByName" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LiveQuizQuestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LiveQuizQuestion_choices_check"
    CHECK (jsonb_typeof("choices") = 'array' AND jsonb_array_length("choices") = 4),
  CONSTRAINT "LiveQuizQuestion_correct_choice_check"
    CHECK ("correctChoice" BETWEEN 0 AND 3),
  CONSTRAINT "LiveQuizQuestion_status_check"
    CHECK ("status" IN ('pending', 'approved', 'rejected', 'archived')),
  CONSTRAINT "LiveQuizQuestion_source_check"
    CHECK ("source" IN ('starter', 'admin', 'community'))
);

CREATE INDEX "LiveQuizQuestion_status_approvedAt_createdAt_idx"
  ON "LiveQuizQuestion"("status", "approvedAt", "createdAt");
CREATE INDEX "LiveQuizQuestion_submitter_lookup_idx"
  ON "LiveQuizQuestion"("submitterType", "submitterId", "createdAt");

CREATE TABLE "LiveQuizSession" (
  "id" TEXT NOT NULL,
  "sessionKey" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "questionIds" JSONB NOT NULL,
  "questionCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LiveQuizSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LiveQuizSession_question_ids_check"
    CHECK (jsonb_typeof("questionIds") = 'array'),
  CONSTRAINT "LiveQuizSession_question_count_check"
    CHECK ("questionCount" >= 0)
);

CREATE UNIQUE INDEX "LiveQuizSession_sessionKey_key"
  ON "LiveQuizSession"("sessionKey");
CREATE INDEX "LiveQuizSession_startsAt_idx"
  ON "LiveQuizSession"("startsAt");

CREATE TABLE "LiveQuizAnswer" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "participantType" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "participantName" TEXT NOT NULL,
  "selectedChoice" INTEGER NOT NULL,
  "isCorrect" BOOLEAN NOT NULL,
  "responseMs" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LiveQuizAnswer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LiveQuizAnswer_selected_choice_check"
    CHECK ("selectedChoice" BETWEEN 0 AND 3),
  CONSTRAINT "LiveQuizAnswer_participant_type_check"
    CHECK ("participantType" IN ('teacher', 'student')),
  CONSTRAINT "LiveQuizAnswer_response_ms_check"
    CHECK ("responseMs" >= 0),
  CONSTRAINT "LiveQuizAnswer_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "LiveQuizSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LiveQuizAnswer_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "LiveQuizQuestion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LiveQuizAnswer_participant_question_key"
  ON "LiveQuizAnswer"(
    "sessionId", "questionId", "participantType", "participantId"
  );
CREATE INDEX "LiveQuizAnswer_session_participant_idx"
  ON "LiveQuizAnswer"("sessionId", "participantType", "participantId");
CREATE INDEX "LiveQuizAnswer_session_question_correct_idx"
  ON "LiveQuizAnswer"("sessionId", "questionId", "isCorrect");

-- Realtime clients must never subscribe to the three internal tables above.
-- These projections contain only public schedule metadata and aggregate counts.
CREATE TABLE "LiveQuizPublicSession" (
  "sessionKey" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "questionCount" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LiveQuizPublicSession_pkey" PRIMARY KEY ("sessionKey"),
  CONSTRAINT "LiveQuizPublicSession_question_count_check"
    CHECK ("questionCount" >= 0)
);

CREATE TABLE "LiveQuizQuestionCounter" (
  "sessionKey" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "answerCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LiveQuizQuestionCounter_pkey"
    PRIMARY KEY ("sessionKey", "questionId"),
  CONSTRAINT "LiveQuizQuestionCounter_answer_count_check"
    CHECK ("answerCount" >= 0)
);

-- Project a newly frozen session without exposing its question ID list.
CREATE FUNCTION "publishLiveQuizPublicSession"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public."LiveQuizPublicSession" (
    "sessionKey", "startsAt", "endsAt", "questionCount", "updatedAt"
  )
  VALUES (
    NEW."sessionKey", NEW."startsAt", NEW."endsAt", NEW."questionCount",
    clock_timestamp()
  )
  ON CONFLICT ("sessionKey") DO UPDATE SET
    "startsAt" = EXCLUDED."startsAt",
    "endsAt" = EXCLUDED."endsAt",
    "questionCount" = EXCLUDED."questionCount",
    "updatedAt" = EXCLUDED."updatedAt";
  RETURN NEW;
END
$$;

CREATE TRIGGER "LiveQuizSession_publish_realtime"
AFTER INSERT OR UPDATE OF "startsAt", "endsAt", "questionCount"
ON "LiveQuizSession"
FOR EACH ROW
EXECUTE FUNCTION "publishLiveQuizPublicSession"();

-- Maintain the public aggregate in the same transaction as a successful answer.
-- ON CONFLICT DO NOTHING answers do not fire this trigger, so duplicate attempts
-- cannot inflate the Realtime count.
CREATE FUNCTION "incrementLiveQuizQuestionCounter"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public."LiveQuizQuestionCounter" (
    "sessionKey", "questionId", "answerCount", "updatedAt"
  )
  SELECT
    session."sessionKey", NEW."questionId", 1, clock_timestamp()
  FROM public."LiveQuizSession" AS session
  WHERE session."id" = NEW."sessionId"
  ON CONFLICT ("sessionKey", "questionId") DO UPDATE SET
    "answerCount" = "LiveQuizQuestionCounter"."answerCount" + 1,
    "updatedAt" = EXCLUDED."updatedAt";
  RETURN NEW;
END
$$;

CREATE TRIGGER "LiveQuizAnswer_increment_realtime_counter"
AFTER INSERT
ON "LiveQuizAnswer"
FOR EACH ROW
EXECUTE FUNCTION "incrementLiveQuizQuestionCounter"();

-- Internal quiz data is server-only. Direct Supabase/PostgREST access must not
-- expose answers, participant identifiers, or unrevealed correct choices.
ALTER TABLE "LiveQuizQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LiveQuizSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LiveQuizAnswer" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  "LiveQuizQuestion", "LiveQuizSession", "LiveQuizAnswer"
FROM PUBLIC;

-- Projection tables are read-only to Realtime clients. Their writes happen only
-- through the SECURITY DEFINER triggers above.
ALTER TABLE "LiveQuizPublicSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LiveQuizQuestionCounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LiveQuizPublicSession" REPLICA IDENTITY FULL;
ALTER TABLE "LiveQuizQuestionCounter" REPLICA IDENTITY FULL;

REVOKE ALL PRIVILEGES ON TABLE
  "LiveQuizPublicSession", "LiveQuizQuestionCounter"
FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION
  "publishLiveQuizPublicSession"(), "incrementLiveQuizQuestionCounter"()
FROM PUBLIC;

CREATE POLICY "LiveQuizPublicSession_select"
ON "LiveQuizPublicSession"
FOR SELECT
TO PUBLIC
USING (true);

CREATE POLICY "LiveQuizQuestionCounter_select"
ON "LiveQuizQuestionCounter"
FOR SELECT
TO PUBLIC
USING (true);

-- Keep local PostgreSQL migrations portable when Supabase roles are absent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public."LiveQuizQuestion", public."LiveQuizSession", public."LiveQuizAnswer" FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public."LiveQuizPublicSession", public."LiveQuizQuestionCounter" FROM anon';
    EXECUTE 'GRANT SELECT ON TABLE public."LiveQuizPublicSession", public."LiveQuizQuestionCounter" TO anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION public."publishLiveQuizPublicSession"(), public."incrementLiveQuizQuestionCounter"() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public."LiveQuizQuestion", public."LiveQuizSession", public."LiveQuizAnswer" FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public."LiveQuizPublicSession", public."LiveQuizQuestionCounter" FROM authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public."LiveQuizPublicSession", public."LiveQuizQuestionCounter" TO authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION public."publishLiveQuizPublicSession"(), public."incrementLiveQuizQuestionCounter"() FROM authenticated';
  END IF;
END
$$;

-- Publish only the safe projections. On a non-Supabase PostgreSQL database the
-- publication is absent and this block intentionally does nothing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'LiveQuizPublicSession'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public."LiveQuizPublicSession"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'LiveQuizQuestionCounter'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public."LiveQuizQuestionCounter"';
  END IF;
END
$$;
