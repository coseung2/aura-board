-- Per-comment likes (one teacher or student like per comment).
CREATE TABLE "CardCommentLike" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "likerKind" "CommentAuthorKind" NOT NULL,
  "likerUserId" TEXT,
  "likerStudentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CardCommentLike_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CardCommentLike_commentId_idx"
  ON "CardCommentLike"("commentId");
CREATE UNIQUE INDEX "CardCommentLike_commentId_likerUserId_key"
  ON "CardCommentLike"("commentId", "likerUserId");
CREATE UNIQUE INDEX "CardCommentLike_commentId_likerStudentId_key"
  ON "CardCommentLike"("commentId", "likerStudentId");

ALTER TABLE "CardCommentLike"
  ADD CONSTRAINT "CardCommentLike_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "CardComment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardCommentLike"
  ADD CONSTRAINT "CardCommentLike_likerUserId_fkey"
  FOREIGN KEY ("likerUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardCommentLike"
  ADD CONSTRAINT "CardCommentLike_likerStudentId_fkey"
  FOREIGN KEY ("likerStudentId") REFERENCES "Student"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- This table is accessed only through authenticated server-side Prisma routes.
ALTER TABLE public."CardCommentLike" ENABLE ROW LEVEL SECURITY;
