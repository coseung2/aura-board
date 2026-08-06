-- Global 13:30 KST live quiz. These tables are intentionally queried through
-- Prisma's parameterized raw-SQL API because sessions store a frozen JSON list
-- of question IDs and answers use a polymorphic teacher/student participant key.

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

-- Only the server-side database connection may access quiz data. Direct
-- Supabase/PostgREST access must not expose answers or unrevealed correct choices.
ALTER TABLE "LiveQuizQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LiveQuizSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LiveQuizAnswer" ENABLE ROW LEVEL SECURITY;

-- Keep local PostgreSQL migrations portable when Supabase roles are absent.
-- Neither direct-access role receives an RLS policy for these tables.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public."LiveQuizQuestion", public."LiveQuizSession", public."LiveQuizAnswer" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public."LiveQuizQuestion", public."LiveQuizSession", public."LiveQuizAnswer" FROM authenticated';
  END IF;
END
$$;
