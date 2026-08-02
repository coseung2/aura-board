-- Common game UI + personal record platform.
-- The five official play layouts are an invariant, results are append-only,
-- and all authoritative state/receipt/result tables stay server-only.

-- ---------------------------------------------------------------------------
-- Board classification invariant
-- ---------------------------------------------------------------------------
ALTER TABLE public."Board"
    DROP CONSTRAINT IF EXISTS "Board_category_layout_check";

UPDATE public."Board"
SET "category" = 'PLAY'
WHERE "layout" IN ('kordle', 'speed-game', 'shadow-alliance', 'omok', 'song-guess');

UPDATE public."Board"
SET "category" = 'LESSON'
WHERE "layout" NOT IN ('kordle', 'speed-game', 'shadow-alliance', 'omok', 'song-guess')
  AND "category" = 'PLAY';

ALTER TABLE public."Board"
    ADD CONSTRAINT "Board_category_layout_check"
    CHECK (
      ("category" = 'PLAY' AND "layout" IN (
        'kordle', 'speed-game', 'shadow-alliance', 'omok', 'song-guess'
      ))
      OR
      ("category" = 'LESSON' AND "layout" NOT IN (
        'kordle', 'speed-game', 'shadow-alliance', 'omok', 'song-guess'
      ))
    );

-- A game-hub room is an internal classroom scope, not teacher-authored content.
-- It is created lazily by the authenticated server entry boundary and remains
-- stable across web/mobile clients. Existing boards keep this column null.
ALTER TABLE public."Board"
    ADD COLUMN IF NOT EXISTS "systemGameKind" TEXT;
ALTER TABLE public."Board"
    ADD CONSTRAINT "Board_system_game_kind_check"
    CHECK (
      "systemGameKind" IS NULL
      OR (
        "systemGameKind" IN (
          'kordle', 'speed-game', 'shadow-alliance', 'omok', 'song-guess'
        )
        AND "systemGameKind" = "layout"
        AND "category" = 'PLAY'
        AND "classroomId" IS NOT NULL
      )
    );
CREATE UNIQUE INDEX "Board_classroomId_systemGameKind_key"
    ON public."Board"("classroomId", "systemGameKind");

-- ---------------------------------------------------------------------------
-- Existing authoritative session lifecycle identity
-- ---------------------------------------------------------------------------
ALTER TABLE public."PlaySession"
    ADD COLUMN IF NOT EXISTS "startedAtMs" BIGINT,
    ADD COLUMN IF NOT EXISTS "completedAtMs" BIGINT,
    ADD COLUMN IF NOT EXISTS "terminalReason" TEXT;

ALTER TABLE public."PlaySession"
    DROP CONSTRAINT IF EXISTS "PlaySession_game_kind_check";
ALTER TABLE public."PlaySession"
    ADD CONSTRAINT "PlaySession_game_kind_check"
    CHECK ("gameKind" IN (
      'kordle', 'speed-game', 'shadow-alliance', 'omok', 'song-guess'
    ));
ALTER TABLE public."PlaySession"
    ADD CONSTRAINT "PlaySession_started_at_ms_check"
    CHECK ("startedAtMs" IS NULL OR ("startedAtMs" >= 0 AND "startedAtMs" <= 9007199254740991));
ALTER TABLE public."PlaySession"
    ADD CONSTRAINT "PlaySession_completed_at_ms_check"
    CHECK ("completedAtMs" IS NULL OR ("completedAtMs" >= 0 AND "completedAtMs" <= 9007199254740991));
ALTER TABLE public."PlaySession"
    ADD CONSTRAINT "PlaySession_lifecycle_order_check"
    CHECK (
      "completedAtMs" IS NULL
      OR ("startedAtMs" IS NOT NULL AND "completedAtMs" >= "startedAtMs")
    );

ALTER TABLE public."PlayParticipant"
    ADD COLUMN IF NOT EXISTS "studentId" TEXT,
    ADD COLUMN IF NOT EXISTS "joinedAtMs" BIGINT,
    ADD COLUMN IF NOT EXISTS "forfeitedAtMs" BIGINT;

-- Resolve legacy student participants only when the actor subject, student row,
-- play session board, and classroom membership all agree. Rows that cannot be
-- proven remain nullable for a separate audit instead of being guessed.
UPDATE public."PlayParticipant" AS participant
SET
  "studentId" = student."id",
  "joinedAtMs" = COALESCE(
    participant."joinedAtMs",
    floor(extract(epoch FROM participant."createdAt") * 1000)::BIGINT
  )
FROM public."PlaySession" AS session
JOIN public."Board" AS board ON board."id" = session."boardId"
JOIN public."Student" AS student ON student."classroomId" = board."classroomId"
WHERE participant."sessionId" = session."id"
  AND participant."actorSubject" = 'student:' || student."id"
  AND participant."studentId" IS NULL;

ALTER TABLE public."PlayParticipant"
    ADD CONSTRAINT "PlayParticipant_joined_at_ms_check"
    CHECK ("joinedAtMs" IS NULL OR ("joinedAtMs" >= 0 AND "joinedAtMs" <= 9007199254740991));
ALTER TABLE public."PlayParticipant"
    ADD CONSTRAINT "PlayParticipant_forfeited_at_ms_check"
    CHECK ("forfeitedAtMs" IS NULL OR ("forfeitedAtMs" >= 0 AND "forfeitedAtMs" <= 9007199254740991));
ALTER TABLE public."PlayParticipant"
    ADD CONSTRAINT "PlayParticipant_actor_student_check"
    CHECK ("studentId" IS NULL OR "actorSubject" = 'student:' || "studentId");
ALTER TABLE public."PlayParticipant"
    ADD CONSTRAINT "PlayParticipant_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES public."Student"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "PlayParticipant_studentId_idx"
    ON public."PlayParticipant"("studentId");

ALTER TABLE public."PlayRequestReceipt"
    DROP CONSTRAINT IF EXISTS "PlayRequestReceipt_scope_type_check";
ALTER TABLE public."PlayRequestReceipt"
    ADD CONSTRAINT "PlayRequestReceipt_scope_type_check"
    CHECK ("scopeType" IN (
      'board_create',
      'session_command',
      'session_rematch',
      'song_guess_board_create',
      'song_guess_session_command',
      'game_result_write',
      'kordle_puzzle_command',
      'kordle_attempt_command',
      'speed_game_run_create',
      'speed_game_run_command',
      'shadow_alliance_board_create',
      'shadow_alliance_session_command',
      'shadow_alliance_session_rematch'
    ));

-- ---------------------------------------------------------------------------
-- Append-only personal result projection
-- ---------------------------------------------------------------------------
CREATE TABLE public."GameResult" (
    "id" TEXT NOT NULL,
    "gameKind" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "score" BIGINT,
    "durationMs" BIGINT,
    "metrics" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "rulesVersion" INTEGER,
    "stateSchemaVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameResult_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GameResult_idempotency_key_key" UNIQUE ("idempotencyKey"),
    CONSTRAINT "GameResult_idempotency_key_check" CHECK (
      octet_length("idempotencyKey") BETWEEN 1 AND 255
    ),
    CONSTRAINT "GameResult_kind_check" CHECK ("gameKind" IN (
      'kordle', 'speed-game', 'shadow-alliance', 'omok', 'song-guess'
    )),
    CONSTRAINT "GameResult_source_type_check" CHECK ("sourceType" IN (
      'play_session', 'kordle_attempt', 'speed_game_run'
    )),
    CONSTRAINT "GameResult_outcome_check" CHECK ("outcome" IN (
      'win', 'loss', 'draw', 'completed', 'forfeit', 'abandoned', 'host-ended'
    )),
    CONSTRAINT "GameResult_score_check" CHECK (
      "score" IS NULL OR ("score" >= 0 AND "score" <= 9007199254740991)
    ),
    CONSTRAINT "GameResult_duration_check" CHECK (
      "durationMs" IS NULL OR ("durationMs" >= 0 AND "durationMs" <= 9007199254740991)
    ),
    CONSTRAINT "GameResult_metrics_check" CHECK (jsonb_typeof("metrics") = 'object'),
    CONSTRAINT "GameResult_time_order_check" CHECK ("completedAt" >= "startedAt"),
    CONSTRAINT "GameResult_rules_version_check" CHECK (
      "rulesVersion" IS NULL OR "rulesVersion" > 0
    ),
    CONSTRAINT "GameResult_state_schema_version_check" CHECK (
      "stateSchemaVersion" IS NULL OR "stateSchemaVersion" > 0
    )
);

CREATE UNIQUE INDEX "GameResult_gameKind_sourceId_studentId_key"
    ON public."GameResult"("gameKind", "sourceId", "studentId");
CREATE INDEX "GameResult_studentId_completedAt_id_idx"
    ON public."GameResult"("studentId", "completedAt" DESC, "id" DESC);
CREATE INDEX "GameResult_studentId_gameKind_completedAt_id_idx"
    ON public."GameResult"("studentId", "gameKind", "completedAt" DESC, "id" DESC);
CREATE INDEX "GameResult_boardId_completedAt_idx"
    ON public."GameResult"("boardId", "completedAt" DESC);

ALTER TABLE public."GameResult"
    ADD CONSTRAINT "GameResult_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES public."Board"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."GameResult"
    ADD CONSTRAINT "GameResult_classroomId_fkey"
    FOREIGN KEY ("classroomId") REFERENCES public."Classroom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."GameResult"
    ADD CONSTRAINT "GameResult_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES public."Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Kordle optimistic versioning and durable terminal reason
-- ---------------------------------------------------------------------------
ALTER TABLE public."KordlePuzzle"
    ADD COLUMN IF NOT EXISTS "version" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public."KordleAttempt"
    ADD COLUMN IF NOT EXISTS "version" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "terminalReason" TEXT;
ALTER TABLE public."KordlePuzzle"
    ADD CONSTRAINT "KordlePuzzle_version_check"
    CHECK ("version" >= 0 AND "version" <= 9007199254740991);
ALTER TABLE public."KordleAttempt"
    ADD CONSTRAINT "KordleAttempt_version_check"
    CHECK ("version" >= 0 AND "version" <= 9007199254740991);
ALTER TABLE public."KordleAttempt"
    ADD CONSTRAINT "KordleAttempt_terminal_reason_check"
    CHECK (
      "terminalReason" IS NULL
      OR "terminalReason" IN (
        'solved', 'guesses_exhausted', 'participant_abandon', 'host_ended', 'deadline'
      )
    );

-- Historical GameResult rows are intentionally not created by this migration.
-- Candidate discovery and any explicit write are handled by the separate
-- dry-run-first audit tool. Legacy SpeedGameAnswer and browser Shadow Alliance
-- state are never treated as authoritative result sources.

-- ---------------------------------------------------------------------------
-- Speed-game immutable runs and frozen membership/round snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE public."SpeedGameRun" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'lobby',
    "version" BIGINT NOT NULL DEFAULT 0,
    "current" BOOLEAN NOT NULL DEFAULT TRUE,
    "previousRunId" TEXT,
    "currentRoundIndex" INTEGER NOT NULL DEFAULT -1,
    "configSnapshot" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "terminalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpeedGameRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SpeedGameRun_status_check" CHECK ("status" IN (
      'lobby', 'running', 'finished', 'abandoned', 'host-ended'
    )),
    CONSTRAINT "SpeedGameRun_version_check" CHECK (
      "version" >= 0 AND "version" <= 9007199254740991
    ),
    CONSTRAINT "SpeedGameRun_round_index_check" CHECK ("currentRoundIndex" >= -1),
    CONSTRAINT "SpeedGameRun_config_check" CHECK (jsonb_typeof("configSnapshot") = 'object'),
    CONSTRAINT "SpeedGameRun_time_order_check" CHECK (
      "completedAt" IS NULL OR ("startedAt" IS NOT NULL AND "completedAt" >= "startedAt")
    ),
    CONSTRAINT "SpeedGameRun_terminal_reason_check" CHECK (
      "terminalReason" IS NULL OR "terminalReason" IN (
        'completed', 'participant_forfeit', 'host_ended'
      )
    )
);

CREATE TABLE public."SpeedGameRunGroup" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "SpeedGameRunGroup_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SpeedGameRunGroup_name_check" CHECK (char_length("name") BETWEEN 1 AND 100),
    CONSTRAINT "SpeedGameRunGroup_order_check" CHECK ("order" >= 0)
);

CREATE TABLE public."SpeedGameRunParticipant" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "memberOrder" INTEGER NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "forfeitedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpeedGameRunParticipant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SpeedGameRunParticipant_member_order_check" CHECK ("memberOrder" >= 0)
);

CREATE TABLE public."SpeedGameRunRound" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceRoundId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "keyword" TEXT NOT NULL,
    "keywordNormalized" TEXT NOT NULL,
    "guesserSlot" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "SpeedGameRunRound_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SpeedGameRunRound_order_check" CHECK ("order" >= 0),
    CONSTRAINT "SpeedGameRunRound_guesser_slot_check" CHECK ("guesserSlot" BETWEEN 1 AND 20),
    CONSTRAINT "SpeedGameRunRound_time_order_check" CHECK (
      "endedAt" IS NULL OR ("startedAt" IS NOT NULL AND "endedAt" >= "startedAt")
    )
);

CREATE TABLE public."SpeedGameRunAnswer" (
    "id" TEXT NOT NULL,
    "runRoundId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL DEFAULT FALSE,
    "approval" TEXT NOT NULL DEFAULT 'pending',
    "score" INTEGER NOT NULL DEFAULT 0,
    "elapsedMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpeedGameRunAnswer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SpeedGameRunAnswer_approval_check" CHECK ("approval" IN ('pending', 'accepted', 'rejected')),
    CONSTRAINT "SpeedGameRunAnswer_score_check" CHECK ("score" >= 0),
    CONSTRAINT "SpeedGameRunAnswer_elapsed_check" CHECK ("elapsedMs" >= 0),
    CONSTRAINT "SpeedGameRunAnswer_text_check" CHECK (char_length("rawText") BETWEEN 1 AND 500)
);

CREATE INDEX "SpeedGameRun_gameId_createdAt_idx"
    ON public."SpeedGameRun"("gameId", "createdAt");
CREATE INDEX "SpeedGameRun_boardId_current_idx"
    ON public."SpeedGameRun"("boardId", "current");
CREATE INDEX "SpeedGameRun_previousRunId_idx"
    ON public."SpeedGameRun"("previousRunId");
CREATE UNIQUE INDEX "SpeedGameRun_current_board_key"
    ON public."SpeedGameRun"("boardId") WHERE "current" = TRUE;
CREATE UNIQUE INDEX "SpeedGameRunGroup_runId_sourceGroupId_key"
    ON public."SpeedGameRunGroup"("runId", "sourceGroupId");
CREATE UNIQUE INDEX "SpeedGameRunGroup_runId_order_key"
    ON public."SpeedGameRunGroup"("runId", "order");
CREATE INDEX "SpeedGameRunGroup_runId_idx"
    ON public."SpeedGameRunGroup"("runId");
CREATE UNIQUE INDEX "SpeedGameRunParticipant_runId_studentId_key"
    ON public."SpeedGameRunParticipant"("runId", "studentId");
CREATE INDEX "SpeedGameRunParticipant_groupId_joinedAt_idx"
    ON public."SpeedGameRunParticipant"("groupId", "joinedAt");
CREATE INDEX "SpeedGameRunParticipant_studentId_createdAt_idx"
    ON public."SpeedGameRunParticipant"("studentId", "createdAt");
CREATE UNIQUE INDEX "SpeedGameRunRound_runId_order_key"
    ON public."SpeedGameRunRound"("runId", "order");
CREATE UNIQUE INDEX "SpeedGameRunRound_runId_sourceRoundId_key"
    ON public."SpeedGameRunRound"("runId", "sourceRoundId");
CREATE INDEX "SpeedGameRunRound_runId_startedAt_idx"
    ON public."SpeedGameRunRound"("runId", "startedAt");
CREATE UNIQUE INDEX "SpeedGameRunAnswer_runRoundId_groupId_key"
    ON public."SpeedGameRunAnswer"("runRoundId", "groupId");
CREATE INDEX "SpeedGameRunAnswer_studentId_createdAt_idx"
    ON public."SpeedGameRunAnswer"("studentId", "createdAt");
CREATE INDEX "SpeedGameRunAnswer_groupId_createdAt_idx"
    ON public."SpeedGameRunAnswer"("groupId", "createdAt");

ALTER TABLE public."SpeedGameRun"
    ADD CONSTRAINT "SpeedGameRun_gameId_fkey"
    FOREIGN KEY ("gameId") REFERENCES public."SpeedGame"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."SpeedGameRun"
    ADD CONSTRAINT "SpeedGameRun_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES public."Board"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."SpeedGameRunGroup"
    ADD CONSTRAINT "SpeedGameRunGroup_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES public."SpeedGameRun"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."SpeedGameRunParticipant"
    ADD CONSTRAINT "SpeedGameRunParticipant_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES public."SpeedGameRun"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."SpeedGameRunParticipant"
    ADD CONSTRAINT "SpeedGameRunParticipant_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES public."SpeedGameRunGroup"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."SpeedGameRunParticipant"
    ADD CONSTRAINT "SpeedGameRunParticipant_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES public."Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."SpeedGameRunRound"
    ADD CONSTRAINT "SpeedGameRunRound_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES public."SpeedGameRun"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."SpeedGameRunAnswer"
    ADD CONSTRAINT "SpeedGameRunAnswer_runRoundId_fkey"
    FOREIGN KEY ("runRoundId") REFERENCES public."SpeedGameRunRound"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."SpeedGameRunAnswer"
    ADD CONSTRAINT "SpeedGameRunAnswer_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES public."SpeedGameRunGroup"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."SpeedGameRunAnswer"
    ADD CONSTRAINT "SpeedGameRunAnswer_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES public."Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Server-only authority hardening
-- ---------------------------------------------------------------------------
ALTER TABLE public."GameResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GameResult" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."PlaySession" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."PlayParticipant" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."PlayRequestReceipt" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."PlayOutbox" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."KordlePuzzle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."KordlePuzzle" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."KordleAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."KordleAttempt" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."KordleGuess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."KordleGuess" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."SpeedGameRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SpeedGameRun" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."SpeedGameRunGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SpeedGameRunGroup" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."SpeedGameRunParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SpeedGameRunParticipant" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."SpeedGameRunRound" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SpeedGameRunRound" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."SpeedGameRunAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SpeedGameRunAnswer" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."GameResult" FROM anon, authenticated;
REVOKE ALL ON TABLE public."PlaySession" FROM anon, authenticated;
REVOKE ALL ON TABLE public."PlayParticipant" FROM anon, authenticated;
REVOKE ALL ON TABLE public."PlayRequestReceipt" FROM anon, authenticated;
REVOKE ALL ON TABLE public."PlayOutbox" FROM anon, authenticated;
REVOKE ALL ON TABLE public."KordlePuzzle" FROM anon, authenticated;
REVOKE ALL ON TABLE public."KordleAttempt" FROM anon, authenticated;
REVOKE ALL ON TABLE public."KordleGuess" FROM anon, authenticated;
REVOKE ALL ON TABLE public."SpeedGameRun" FROM anon, authenticated;
REVOKE ALL ON TABLE public."SpeedGameRunGroup" FROM anon, authenticated;
REVOKE ALL ON TABLE public."SpeedGameRunParticipant" FROM anon, authenticated;
REVOKE ALL ON TABLE public."SpeedGameRunRound" FROM anon, authenticated;
REVOKE ALL ON TABLE public."SpeedGameRunAnswer" FROM anon, authenticated;
