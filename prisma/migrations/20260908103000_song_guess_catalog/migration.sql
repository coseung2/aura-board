CREATE TABLE "public"."SongGuessCatalogSong" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "aliases" JSONB NOT NULL,
    "categories" JSONB NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SongGuessCatalogSong_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."SongGuessCatalogClip" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'audio/wav',
    "durationMs" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SongGuessCatalogClip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SongGuessCatalogClip_objectKey_key" ON "public"."SongGuessCatalogClip"("objectKey");
CREATE UNIQUE INDEX "SongGuessCatalogClip_songId_segment_key" ON "public"."SongGuessCatalogClip"("songId", "segment");
CREATE INDEX "SongGuessCatalogSong_updatedAt_idx" ON "public"."SongGuessCatalogSong"("updatedAt");
CREATE INDEX "SongGuessCatalogClip_songId_idx" ON "public"."SongGuessCatalogClip"("songId");

ALTER TABLE "public"."SongGuessCatalogClip"
  ADD CONSTRAINT "SongGuessCatalogClip_songId_fkey"
  FOREIGN KEY ("songId") REFERENCES "public"."SongGuessCatalogSong"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."SongGuessCatalogSong" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SongGuessCatalogClip" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."SongGuessCatalogSong" FROM anon, authenticated;
REVOKE ALL ON TABLE public."SongGuessCatalogClip" FROM anon, authenticated;
