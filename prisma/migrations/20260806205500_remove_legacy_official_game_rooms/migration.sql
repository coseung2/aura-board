-- Official games now live only in server-owned, classroom-scoped game-hub rooms.
-- Remove older teacher-authored official-game boards and their cascading game data.
-- Normal lesson boards, quizzes, DJ queues, and other teacher content are untouched.
DELETE FROM public."Board"
WHERE "systemGameKind" IS NULL
  AND "layout" IN (
    'kordle',
    'speed-game',
    'shadow-alliance',
    'omok',
    'song-guess'
  );
