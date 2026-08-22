-- Feed engagement is intentionally independent from Card engagement. Feed
-- posts have no board/card foreign key and can be published to many classes.
CREATE TABLE "FeedPostLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "likerKind" TEXT NOT NULL,
    "likerUserId" TEXT,
    "likerStudentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPostLike_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeedPostLike_postId_fkey"
      FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedPostLike_likerUserId_fkey"
      FOREIGN KEY ("likerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedPostLike_likerStudentId_fkey"
      FOREIGN KEY ("likerStudentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedPostLike_liker_kind_check"
      CHECK (
        ("likerKind" = 'teacher' AND "likerUserId" IS NOT NULL AND "likerStudentId" IS NULL)
        OR ("likerKind" = 'student' AND "likerUserId" IS NULL AND "likerStudentId" IS NOT NULL)
      )
);

CREATE TABLE "FeedComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "authorKind" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorStudentId" TEXT,
    "content" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedComment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeedComment_postId_fkey"
      FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedComment_classroomId_fkey"
      FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedComment_authorUserId_fkey"
      FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeedComment_authorStudentId_fkey"
      FOREIGN KEY ("authorStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeedComment_parentCommentId_fkey"
      FOREIGN KEY ("parentCommentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedComment_author_kind_check"
      CHECK (
        ("authorKind" = 'teacher' AND "authorUserId" IS NOT NULL AND "authorStudentId" IS NULL)
        OR ("authorKind" = 'student' AND "authorUserId" IS NULL AND "authorStudentId" IS NOT NULL)
      ),
    CONSTRAINT "FeedComment_content_check"
      CHECK (char_length(btrim("content")) > 0)
);

CREATE TABLE "FeedCommentLike" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "likerKind" TEXT NOT NULL,
    "likerUserId" TEXT,
    "likerStudentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedCommentLike_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeedCommentLike_commentId_fkey"
      FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedCommentLike_likerUserId_fkey"
      FOREIGN KEY ("likerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedCommentLike_likerStudentId_fkey"
      FOREIGN KEY ("likerStudentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedCommentLike_liker_kind_check"
      CHECK (
        ("likerKind" = 'teacher' AND "likerUserId" IS NOT NULL AND "likerStudentId" IS NULL)
        OR ("likerKind" = 'student' AND "likerUserId" IS NULL AND "likerStudentId" IS NOT NULL)
      )
);

CREATE UNIQUE INDEX "FeedPostLike_postId_likerUserId_key"
  ON "FeedPostLike"("postId", "likerUserId");
CREATE UNIQUE INDEX "FeedPostLike_postId_likerStudentId_key"
  ON "FeedPostLike"("postId", "likerStudentId");
CREATE INDEX "FeedPostLike_postId_idx" ON "FeedPostLike"("postId");

CREATE INDEX "FeedComment_postId_classroomId_createdAt_idx"
  ON "FeedComment"("postId", "classroomId", "createdAt");
CREATE INDEX "FeedComment_parentCommentId_createdAt_idx"
  ON "FeedComment"("parentCommentId", "createdAt");
CREATE INDEX "FeedComment_authorStudentId_idx"
  ON "FeedComment"("authorStudentId");

CREATE UNIQUE INDEX "FeedCommentLike_commentId_likerUserId_key"
  ON "FeedCommentLike"("commentId", "likerUserId");
CREATE UNIQUE INDEX "FeedCommentLike_commentId_likerStudentId_key"
  ON "FeedCommentLike"("commentId", "likerStudentId");
CREATE INDEX "FeedCommentLike_commentId_idx" ON "FeedCommentLike"("commentId");

-- These tables are server-managed, matching the existing feed foundation.
ALTER TABLE public."FeedPostLike" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FeedComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FeedCommentLike" ENABLE ROW LEVEL SECURITY;

-- Feed safety is separate because the application database role does not own
-- the legacy ContentTargetKind enum used by board safety tables.
CREATE TABLE "FeedHiddenContent" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "viaReport" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedHiddenContent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeedHiddenContent_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedHiddenContent_target_kind_check"
      CHECK ("targetKind" IN ('feed_post', 'feed_comment'))
);

CREATE TABLE "FeedContentReport" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reporterStudentId" TEXT NOT NULL,
    "authorStudentId" TEXT,
    "authorLabel" TEXT,
    "reason" "ContentReportReason" NOT NULL,
    "detail" TEXT,
    "contentSnapshot" TEXT,
    "status" "ContentReportStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    CONSTRAINT "FeedContentReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeedContentReport_classroomId_fkey"
      FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedContentReport_reporterStudentId_fkey"
      FOREIGN KEY ("reporterStudentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedContentReport_authorStudentId_fkey"
      FOREIGN KEY ("authorStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeedContentReport_resolvedByUserId_fkey"
      FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeedContentReport_target_kind_check"
      CHECK ("targetKind" IN ('feed_post', 'feed_comment'))
);

CREATE UNIQUE INDEX "FeedHiddenContent_studentId_targetKind_targetId_key"
  ON "FeedHiddenContent"("studentId", "targetKind", "targetId");
CREATE INDEX "FeedHiddenContent_studentId_createdAt_idx"
  ON "FeedHiddenContent"("studentId", "createdAt");
CREATE UNIQUE INDEX "FeedContentReport_reporterStudentId_targetKind_targetId_key"
  ON "FeedContentReport"("reporterStudentId", "targetKind", "targetId");
CREATE INDEX "FeedContentReport_classroomId_status_createdAt_idx"
  ON "FeedContentReport"("classroomId", "status", "createdAt");

ALTER TABLE public."FeedHiddenContent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FeedContentReport" ENABLE ROW LEVEL SECURITY;
