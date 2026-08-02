-- Allow deterministic browser-encoded PCM WAV derivatives. Source audio is
-- still never persisted; every accepted row remains one fixed 0.5/1.0/1.5s
-- private clip with the existing size and duration constraints.

ALTER TABLE public."SongGuessAsset"
    DROP CONSTRAINT IF EXISTS "SongGuessAsset_mime_check";
ALTER TABLE public."SongGuessAsset"
    ADD CONSTRAINT "SongGuessAsset_mime_check"
    CHECK ("mimeType" IN ('audio/wav', 'audio/mp4', 'audio/webm', 'audio/ogg'));
