-- 주제별 보드 정렬 (2026-07-08)
-- 학생이름 시드 모달의 기본값 + 보드설정 > 주제 정렬 탭의 마지막 선택을 보드 단위로 보관한다.
-- "asc" = 1번부터 보드 왼쪽, "desc" = N번부터 보드 왼쪽.
ALTER TABLE "Board" ADD COLUMN "subjectOrder" TEXT DEFAULT 'asc';
