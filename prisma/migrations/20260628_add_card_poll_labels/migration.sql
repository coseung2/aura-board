-- comment-area poll labels (2026-06-28): 교사가 선택지 이름을 직접 정할 수 있게 한다.
-- 기존 투표 카드들은 null 상태로 두고, API/UI에서 "1번", "2번" 기본 라벨로 fallback한다.

ALTER TABLE "Card" ADD COLUMN "commentVoteOptionLabels" JSONB;
