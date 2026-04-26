-- card-comments-likes (2026-04-26): per-card comments + likes 토글, 보드 단위
-- 작성자 익명 마스킹 토글.

-- 1) Board.anonymousAuthor
ALTER TABLE "Board" ADD COLUMN "anonymousAuthor" BOOLEAN NOT NULL DEFAULT false;

-- 2) CommentAuthorKind enum (teacher | student)
CREATE TYPE "CommentAuthorKind" AS ENUM ('teacher', 'student');

-- 3) CardComment
CREATE TABLE "CardComment" (
  "id" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "authorKind" "CommentAuthorKind" NOT NULL,
  "authorUserId" TEXT,
  "authorStudentId" TEXT,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "CardComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CardComment_cardId_createdAt_idx" ON "CardComment"("cardId", "createdAt");
CREATE INDEX "CardComment_authorUserId_idx" ON "CardComment"("authorUserId");
CREATE INDEX "CardComment_authorStudentId_idx" ON "CardComment"("authorStudentId");

ALTER TABLE "CardComment" ADD CONSTRAINT "CardComment_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardComment" ADD CONSTRAINT "CardComment_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CardComment" ADD CONSTRAINT "CardComment_authorStudentId_fkey"
  FOREIGN KEY ("authorStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4) CardLike — dual @@unique 로 사용자/학생 좋아요 1회 enforce.
-- Postgres NULL distinct 의미상 (cardId, NULL) 행은 unique 검사에서 제외 →
-- 학생 좋아요 (likerUserId NULL) 끼리는 likerStudentId 로 unique, 교사 좋아요
-- (likerStudentId NULL) 끼리는 likerUserId 로 unique.
CREATE TABLE "CardLike" (
  "id" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "likerKind" "CommentAuthorKind" NOT NULL,
  "likerUserId" TEXT,
  "likerStudentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CardLike_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CardLike_cardId_idx" ON "CardLike"("cardId");
CREATE UNIQUE INDEX "CardLike_cardId_likerUserId_key" ON "CardLike"("cardId", "likerUserId");
CREATE UNIQUE INDEX "CardLike_cardId_likerStudentId_key" ON "CardLike"("cardId", "likerStudentId");

ALTER TABLE "CardLike" ADD CONSTRAINT "CardLike_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardLike" ADD CONSTRAINT "CardLike_likerUserId_fkey"
  FOREIGN KEY ("likerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardLike" ADD CONSTRAINT "CardLike_likerStudentId_fkey"
  FOREIGN KEY ("likerStudentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
