-- Authoritative song-guess setup and private browser-derived audio clips.
-- No source URL or original upload is persisted; each asset is an opaque
-- private-storage object key for one fixed progressive tier.

ALTER TABLE public."PlaySession"
    DROP CONSTRAINT IF EXISTS "PlaySession_game_kind_check";
ALTER TABLE public."PlaySession"
    ADD CONSTRAINT "PlaySession_game_kind_check"
    CHECK ("gameKind" IN ('omok', 'song_guess'));

ALTER TABLE public."PlayParticipant"
    DROP CONSTRAINT IF EXISTS "PlayParticipant_slot_check";
ALTER TABLE public."PlayParticipant"
    ADD CONSTRAINT "PlayParticipant_slot_check"
    CHECK (
      "slot" IN ('first', 'second')
      OR ("slot" LIKE 'player:%' AND char_length("slot") BETWEEN 8 AND 64)
    );

ALTER TABLE public."PlayRequestReceipt"
    DROP CONSTRAINT IF EXISTS "PlayRequestReceipt_scope_type_check";
ALTER TABLE public."PlayRequestReceipt"
    ADD CONSTRAINT "PlayRequestReceipt_scope_type_check"
    CHECK ("scopeType" IN (
      'board_create',
      'session_command',
      'session_rematch',
      'song_guess_board_create',
      'song_guess_session_command'
    ));

CREATE TABLE public."SongGuessGame" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "representativeAnswer" TEXT NOT NULL,
    "normalizedAnswer" TEXT NOT NULL,
    "aliases" JSONB NOT NULL,
    "normalizedAliases" JSONB NOT NULL,
    "accessibilityClue" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SongGuessGame_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SongGuessGame_board_id_key" UNIQUE ("boardId"),
    CONSTRAINT "SongGuessGame_answer_check"
      CHECK (char_length("representativeAnswer") BETWEEN 1 AND 200),
    CONSTRAINT "SongGuessGame_normalized_answer_check"
      CHECK (char_length("normalizedAnswer") BETWEEN 1 AND 200)
);

CREATE TABLE public."SongGuessAsset" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "gameId" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "tierMs" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SongGuessAsset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SongGuessAsset_object_key_key" UNIQUE ("objectKey"),
    CONSTRAINT "SongGuessAsset_tier_check"
      CHECK ("tierMs" IN (500, 1000, 1500)),
    CONSTRAINT "SongGuessAsset_mime_check"
      CHECK ("mimeType" IN ('audio/mp4', 'audio/webm', 'audio/ogg')),
    CONSTRAINT "SongGuessAsset_size_check"
      CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 8388608),
    CONSTRAINT "SongGuessAsset_duration_check"
      CHECK (
        ("tierMs" = 500 AND "durationMs" BETWEEN 450 AND 550)
        OR ("tierMs" = 1000 AND "durationMs" BETWEEN 950 AND 1050)
        OR ("tierMs" = 1500 AND "durationMs" BETWEEN 1450 AND 1550)
      ),
    CONSTRAINT "SongGuessAsset_object_key_check"
      CHECK (
        "objectKey" LIKE 'song-guess/%'
        AND position('..' IN "objectKey") = 0
        AND position(':' IN "objectKey") = 0
      )
);

CREATE UNIQUE INDEX "SongGuessAsset_gameId_tierMs_key"
    ON public."SongGuessAsset"("gameId", "tierMs");
CREATE INDEX "SongGuessGame_createdByUserId_idx"
    ON public."SongGuessGame"("createdByUserId");
CREATE INDEX "SongGuessAsset_boardId_createdAt_idx"
    ON public."SongGuessAsset"("boardId", "createdAt");
CREATE INDEX "SongGuessAsset_uploadedByUserId_boardId_idx"
    ON public."SongGuessAsset"("uploadedByUserId", "boardId");

ALTER TABLE public."SongGuessGame"
    ADD CONSTRAINT "SongGuessGame_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES public."Board"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."SongGuessAsset"
    ADD CONSTRAINT "SongGuessAsset_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES public."Board"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."SongGuessAsset"
    ADD CONSTRAINT "SongGuessAsset_gameId_fkey"
    FOREIGN KEY ("gameId") REFERENCES public."SongGuessGame"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public."SongGuessGame" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SongGuessAsset" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."SongGuessGame" FROM anon, authenticated;
REVOKE ALL ON TABLE public."SongGuessAsset" FROM anon, authenticated;
