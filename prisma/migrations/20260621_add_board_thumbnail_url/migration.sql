-- Board thumbnail URL: stores a public image URL used when
-- Board.thumbnailMode = "custom". Nullable so default/none modes
-- do not require a URL (frontend can fall back to layout default).
ALTER TABLE "Board" ADD COLUMN "thumbnailUrl" TEXT;
