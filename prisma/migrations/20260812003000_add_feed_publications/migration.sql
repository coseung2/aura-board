-- Feed content is stored once and distributed through publications.
-- A pooled post can be referenced by many classrooms without copying the post.

CREATE TABLE "FeedPost" (
    "id" TEXT NOT NULL,
    "authorKind" TEXT NOT NULL,
    "authorDisplayName" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorStudentId" TEXT,
    "title" TEXT,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeedPost_authorUserId_fkey"
      FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeedPost_authorStudentId_fkey"
      FOREIGN KEY ("authorStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeedPost_author_kind_check"
      CHECK ("authorKind" IN ('PLATFORM', 'TEACHER', 'STUDENT')),
    CONSTRAINT "FeedPost_status_check"
      CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    CONSTRAINT "FeedPost_author_display_name_check"
      CHECK (char_length(btrim("authorDisplayName")) > 0),
    CONSTRAINT "FeedPost_author_identity_check"
      CHECK (
        ("authorKind" IN ('PLATFORM', 'TEACHER') AND "authorStudentId" IS NULL)
        OR ("authorKind" = 'STUDENT' AND "authorUserId" IS NULL)
      )
);

CREATE TABLE "FeedPostMedia" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "youtubeVideoId" TEXT,
    "altText" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPostMedia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeedPostMedia_postId_fkey"
      FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedPostMedia_kind_check"
      CHECK ("kind" IN ('IMAGE', 'YOUTUBE')),
    CONSTRAINT "FeedPostMedia_position_check"
      CHECK ("position" >= 0),
    CONSTRAINT "FeedPostMedia_youtube_check"
      CHECK (
        ("kind" = 'IMAGE' AND "youtubeVideoId" IS NULL)
        OR ("kind" = 'YOUTUBE' AND "youtubeVideoId" IS NOT NULL AND char_length("youtubeVideoId") > 0)
      )
);

CREATE TABLE "FeedPublication" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "classroomId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "publishedByUserId" TEXT,
    "publishedByStudentId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPublication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeedPublication_postId_fkey"
      FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedPublication_classroomId_fkey"
      FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedPublication_publishedByUserId_fkey"
      FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeedPublication_publishedByStudentId_fkey"
      FOREIGN KEY ("publishedByStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeedPublication_scope_check"
      CHECK ("scope" IN ('GLOBAL', 'CLASSROOM')),
    CONSTRAINT "FeedPublication_status_check"
      CHECK ("status" IN ('ACTIVE', 'REMOVED')),
    CONSTRAINT "FeedPublication_scope_target_check"
      CHECK (
        ("scope" = 'GLOBAL' AND "classroomId" IS NULL)
        OR ("scope" = 'CLASSROOM' AND "classroomId" IS NOT NULL)
      )
);

CREATE TABLE "FeedPoolEntry" (
    "postId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPoolEntry_pkey" PRIMARY KEY ("postId"),
    CONSTRAINT "FeedPoolEntry_postId_fkey"
      FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedPoolEntry_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeedPoolEntry_status_check"
      CHECK ("status" IN ('AVAILABLE', 'WITHDRAWN'))
);

CREATE UNIQUE INDEX "FeedPostMedia_postId_position_key"
  ON "FeedPostMedia"("postId", "position");
CREATE INDEX "FeedPost_status_createdAt_idx"
  ON "FeedPost"("status", "createdAt" DESC);
CREATE INDEX "FeedPublication_scope_status_publishedAt_id_idx"
  ON "FeedPublication"("scope", "status", "publishedAt" DESC, "id" DESC);
CREATE INDEX "FeedPublication_classroomId_status_publishedAt_id_idx"
  ON "FeedPublication"("classroomId", "status", "publishedAt" DESC, "id" DESC);
CREATE UNIQUE INDEX "FeedPublication_global_post_key"
  ON "FeedPublication"("postId")
  WHERE "scope" = 'GLOBAL';
CREATE UNIQUE INDEX "FeedPublication_classroom_post_key"
  ON "FeedPublication"("postId", "classroomId")
  WHERE "scope" = 'CLASSROOM';
CREATE INDEX "FeedPoolEntry_status_createdAt_idx"
  ON "FeedPoolEntry"("status", "createdAt" DESC);

-- These tables are owned by server-side routes. Keep them inaccessible through
-- the Supabase Data API, matching the existing server-managed content tables.
ALTER TABLE public."FeedPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FeedPostMedia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FeedPublication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FeedPoolEntry" ENABLE ROW LEVEL SECURITY;
