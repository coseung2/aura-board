-- Nullable/additive: legacy and hand-authored rounds remain readable.
ALTER TABLE "SongGuessRound" ADD COLUMN "sourceCatalogSongId" TEXT;
