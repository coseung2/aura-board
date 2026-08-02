-- Authoritative song-guess pack/round storage.
-- This is intentionally append-only after 20260802090000_song_guess. Existing
-- one-round rows are promoted to an ordered pack with one round, while the
-- public PlaySession kind is normalized to the stable wire value song-guess.

ALTER TABLE public."PlaySession"
    DROP CONSTRAINT IF EXISTS "PlaySession_game_kind_check";
UPDATE public."PlaySession"
SET "gameKind" = 'song-guess'
WHERE "gameKind" = 'song_guess';
ALTER TABLE public."PlaySession"
    ADD CONSTRAINT "PlaySession_game_kind_check"
    CHECK ("gameKind" IN ('omok', 'song-guess'));

CREATE TABLE public."SongGuessRound" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "representativeAnswer" TEXT NOT NULL,
    "normalizedAnswer" TEXT NOT NULL,
    "aliases" JSONB NOT NULL,
    "normalizedAliases" JSONB NOT NULL,
    "accessibilityClue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SongGuessRound_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SongGuessRound_order_check" CHECK ("order" BETWEEN 0 AND 49),
    CONSTRAINT "SongGuessRound_answer_check"
      CHECK (char_length("representativeAnswer") BETWEEN 1 AND 200),
    CONSTRAINT "SongGuessRound_normalized_answer_check"
      CHECK (char_length("normalizedAnswer") BETWEEN 1 AND 200)
);

INSERT INTO public."SongGuessRound" (
    "id",
    "gameId",
    "order",
    "representativeAnswer",
    "normalizedAnswer",
    "aliases",
    "normalizedAliases",
    "accessibilityClue"
)
SELECT
    g."id" || '-round-0',
    g."id",
    0,
    g."representativeAnswer",
    g."normalizedAnswer",
    g."aliases",
    g."normalizedAliases",
    g."accessibilityClue"
FROM public."SongGuessGame" AS g;

ALTER TABLE public."SongGuessAsset"
    ADD COLUMN "roundId" TEXT;

UPDATE public."SongGuessAsset" AS asset
SET "roundId" = round."id"
FROM public."SongGuessRound" AS round
WHERE asset."gameId" = round."gameId";

ALTER TABLE public."SongGuessAsset"
    DROP CONSTRAINT IF EXISTS "SongGuessAsset_gameId_fkey";
DROP INDEX IF EXISTS "SongGuessAsset_gameId_tierMs_key";
ALTER TABLE public."SongGuessAsset"
    DROP COLUMN "gameId";

ALTER TABLE public."SongGuessGame"
    DROP CONSTRAINT IF EXISTS "SongGuessGame_answer_check",
    DROP CONSTRAINT IF EXISTS "SongGuessGame_normalized_answer_check";
ALTER TABLE public."SongGuessGame"
    DROP COLUMN "representativeAnswer",
    DROP COLUMN "normalizedAnswer",
    DROP COLUMN "aliases",
    DROP COLUMN "normalizedAliases",
    DROP COLUMN "accessibilityClue";

ALTER TABLE public."SongGuessRound"
    ADD CONSTRAINT "SongGuessRound_gameId_fkey"
    FOREIGN KEY ("gameId") REFERENCES public."SongGuessGame"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."SongGuessAsset"
    ADD CONSTRAINT "SongGuessAsset_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES public."SongGuessRound"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "SongGuessRound_gameId_order_key"
    ON public."SongGuessRound"("gameId", "order");
CREATE INDEX "SongGuessRound_gameId_order_idx"
    ON public."SongGuessRound"("gameId", "order");
CREATE UNIQUE INDEX "SongGuessAsset_roundId_tierMs_key"
    ON public."SongGuessAsset"("roundId", "tierMs");

ALTER TABLE public."SongGuessRound" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."SongGuessRound" FROM anon, authenticated;
