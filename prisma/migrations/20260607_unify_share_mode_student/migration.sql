UPDATE "Board"
SET "shareMode" = 'student'
WHERE "shareMode" IN ('view', 'comment', 'edit');

