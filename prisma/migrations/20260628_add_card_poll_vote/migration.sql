-- comment-area poll (2026-06-28): 교사가 카드 발행 시 선택지 개수(2~6)를 정해두면
-- 학생이 댓글창에서 투표한다. Card 에 옵션 수 필드를 추가하고, 학생 표 row
-- 테이블을 신설한다.

-- ── 1. Card.commentVoteOptionCount ────────────────────────────────
ALTER TABLE "Card" ADD COLUMN "commentVoteOptionCount" INTEGER;

-- ── 2. CardPollVote ──────────────────────────────────────────────
CREATE TABLE "CardPollVote" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "voterStudentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardPollVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CardPollVote_cardId_voterStudentId_key"
    ON "CardPollVote"("cardId", "voterStudentId");
CREATE INDEX "CardPollVote_cardId_idx"
    ON "CardPollVote"("cardId");
CREATE INDEX "CardPollVote_voterStudentId_idx"
    ON "CardPollVote"("voterStudentId");

ALTER TABLE "CardPollVote" ADD CONSTRAINT "CardPollVote_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardPollVote" ADD CONSTRAINT "CardPollVote_voterStudentId_fkey"
    FOREIGN KEY ("voterStudentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
