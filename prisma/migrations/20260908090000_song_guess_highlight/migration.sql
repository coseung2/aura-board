ALTER TABLE public."SongGuessAsset"
  DROP CONSTRAINT "SongGuessAsset_tier_check",
  DROP CONSTRAINT "SongGuessAsset_duration_check",
  DROP CONSTRAINT IF EXISTS "SongGuessAsset_mime_check",
  DROP CONSTRAINT IF EXISTS "SongGuessAsset_size_check";

ALTER TABLE public."SongGuessAsset"
  ADD COLUMN "youtubeVideoId" TEXT,
  ADD COLUMN "playbackStartMs" INTEGER;

ALTER TABLE public."SongGuessAsset"
  ADD CONSTRAINT "SongGuessAsset_tier_check" CHECK ("tierMs" IN (500, 1000, 1500, 15000)),
  ADD CONSTRAINT "SongGuessAsset_duration_check" CHECK (
    "durationMs" BETWEEN "tierMs" - 50 AND "tierMs" + 50
  ),
  ADD CONSTRAINT "SongGuessAsset_mime_check" CHECK (
    "mimeType" IN ('audio/wav', 'audio/mp4', 'audio/webm', 'audio/ogg', 'video/youtube')
  ),
  ADD CONSTRAINT "SongGuessAsset_size_check" CHECK (
    ("mimeType" = 'video/youtube' AND "sizeBytes" = 0)
    OR ("mimeType" <> 'video/youtube' AND "sizeBytes" > 0 AND "sizeBytes" <= 8388608)
  ),
  ADD CONSTRAINT "SongGuessAsset_youtube_check" CHECK (
    ("mimeType" = 'video/youtube'
      AND "youtubeVideoId" IS NOT NULL
      AND char_length("youtubeVideoId") BETWEEN 1 AND 128
      AND "playbackStartMs" IS NOT NULL
      AND "playbackStartMs" >= 0)
    OR ("mimeType" <> 'video/youtube'
      AND "youtubeVideoId" IS NULL
      AND "playbackStartMs" IS NULL)
  );
