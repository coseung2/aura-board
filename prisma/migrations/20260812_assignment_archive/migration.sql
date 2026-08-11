-- Assignment archiving (2026-08-12)
-- 과제현황 페이지의 마감 토글이 설정하는 값. 설정되면 미제출 집계/노출에서
-- 제외된다. 마감일(assignmentDeadline / assignmentPublishedAt)은 보상 기준일이
--므로 이 컬럼과는 독립적이다.

ALTER TABLE "Board" ADD COLUMN "assignmentArchivedAt" TIMESTAMP(3);

ALTER TABLE "Section" ADD COLUMN "assignmentArchivedAt" TIMESTAMP(3);
