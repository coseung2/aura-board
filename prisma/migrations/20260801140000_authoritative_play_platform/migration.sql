-- Authoritative Rust play platform persistence.
-- Every accepted command writes the aggregate, durable idempotency receipt,
-- and compact realtime invalidation outbox row in one transaction.
CREATE TABLE public."PlaySession" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "hostSubject" TEXT NOT NULL,
    "gameKind" TEXT NOT NULL DEFAULT 'omok',
    "version" BIGINT NOT NULL DEFAULT 0,
    "rulesVersion" INTEGER NOT NULL,
    "stateSchemaVersion" INTEGER NOT NULL,
    "previousSessionId" TEXT,
    "current" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAtMs" BIGINT NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaySession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlaySession_game_kind_check" CHECK ("gameKind" IN ('omok')),
    CONSTRAINT "PlaySession_version_check"
      CHECK ("version" >= 0 AND "version" <= 9007199254740991),
    CONSTRAINT "PlaySession_rules_version_check" CHECK ("rulesVersion" > 0),
    CONSTRAINT "PlaySession_state_schema_version_check" CHECK ("stateSchemaVersion" > 0),
    CONSTRAINT "PlaySession_host_subject_check" CHECK (length("hostSubject") BETWEEN 1 AND 255)
);

CREATE TABLE public."PlayParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actorSubject" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayParticipant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlayParticipant_slot_check" CHECK ("slot" IN ('first', 'second')),
    CONSTRAINT "PlayParticipant_actor_subject_check" CHECK (length("actorSubject") BETWEEN 1 AND 255),
    CONSTRAINT "PlayParticipant_display_name_check" CHECK (char_length("displayName") BETWEEN 1 AND 100)
);

CREATE TABLE public."PlayRequestReceipt" (
    "id" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayRequestReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlayRequestReceipt_scope_type_check"
      CHECK ("scopeType" IN ('board_create', 'session_command', 'session_rematch')),
    CONSTRAINT "PlayRequestReceipt_request_id_check"
      CHECK (length("requestId") BETWEEN 1 AND 128),
    CONSTRAINT "PlayRequestReceipt_request_hash_check"
      CHECK (length("requestHash") = 64)
);

CREATE TABLE public."PlayOutbox" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "version" BIGINT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockToken" TEXT,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayOutbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlayOutbox_version_check"
      CHECK ("version" >= 0 AND "version" <= 9007199254740991),
    CONSTRAINT "PlayOutbox_event_type_check"
      CHECK ("eventType" IN ('session_created', 'session_changed')),
    CONSTRAINT "PlayOutbox_status_check"
      CHECK ("status" IN ('pending', 'processing', 'processed', 'dead')),
    CONSTRAINT "PlayOutbox_attempts_check" CHECK ("attempts" >= 0)
);

CREATE INDEX "PlaySession_boardId_createdAt_idx"
    ON public."PlaySession"("boardId", "createdAt");
CREATE INDEX "PlaySession_boardId_current_idx"
    ON public."PlaySession"("boardId", "current");
-- Exactly one recoverable current session per board. This closes the no-row
-- race in addition to the repository's board-scoped advisory transaction lock.
CREATE UNIQUE INDEX "PlaySession_current_board_key"
    ON public."PlaySession"("boardId") WHERE "current" = TRUE;

CREATE UNIQUE INDEX "PlayParticipant_sessionId_actorSubject_key"
    ON public."PlayParticipant"("sessionId", "actorSubject");
CREATE UNIQUE INDEX "PlayParticipant_sessionId_slot_key"
    ON public."PlayParticipant"("sessionId", "slot");
CREATE INDEX "PlayParticipant_actorSubject_idx"
    ON public."PlayParticipant"("actorSubject");

CREATE UNIQUE INDEX "PlayRequestReceipt_scopeType_scopeId_requestId_key"
    ON public."PlayRequestReceipt"("scopeType", "scopeId", "requestId");
CREATE INDEX "PlayRequestReceipt_createdAt_idx"
    ON public."PlayRequestReceipt"("createdAt");

CREATE INDEX "PlayOutbox_status_nextAttemptAt_createdAt_idx"
    ON public."PlayOutbox"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "PlayOutbox_boardId_createdAt_idx"
    ON public."PlayOutbox"("boardId", "createdAt");

ALTER TABLE public."PlaySession"
    ADD CONSTRAINT "PlaySession_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES public."Board"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."PlayParticipant"
    ADD CONSTRAINT "PlayParticipant_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES public."PlaySession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."PlayOutbox"
    ADD CONSTRAINT "PlayOutbox_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES public."PlaySession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- The Rust service connects with a server database role. Supabase browser
-- roles receive neither policies nor grants for aggregate state, membership,
-- receipts, or the transactional outbox.
ALTER TABLE public."PlaySession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PlayParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PlayRequestReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PlayOutbox" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."PlaySession" FROM anon, authenticated;
REVOKE ALL ON TABLE public."PlayParticipant" FROM anon, authenticated;
REVOKE ALL ON TABLE public."PlayRequestReceipt" FROM anon, authenticated;
REVOKE ALL ON TABLE public."PlayOutbox" FROM anon, authenticated;
