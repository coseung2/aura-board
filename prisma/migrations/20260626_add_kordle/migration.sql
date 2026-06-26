-- BC-2: Kordle (built-in Wordle) engine
-- Three enums + 5 tables + indexes + CHECK constraints.
-- Migration order: KordleWord before KordlePuzzle (FK target).
-- Enums first so they are valid types for subsequent column declarations.

-- Enums
CREATE TYPE "KordleGameMode" AS ENUM ('CLASSIC', 'DAILY', 'TEACHER_CUSTOM', 'LIVE_CLASS');
CREATE TYPE "KordlePuzzleStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'CLOSED', 'ARCHIVED');
CREATE TYPE "KordleAttemptStatus" AS ENUM ('IN_PROGRESS', 'WON', 'LOST', 'ABANDONED');

-- KordleWord (dictionary). Created FIRST because KordlePuzzle.solutionWordId
-- references it. The dictionary holds both isSolution (could be the daily
-- answer) and isAllowed (valid guesses, not solutions).
CREATE TABLE "KordleWord" (
  "id" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "normalized" TEXT NOT NULL,
  "length" INTEGER NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'ko-KR',
  "difficulty" INTEGER,
  "isSolution" BOOLEAN NOT NULL DEFAULT true,
  "isAllowed" BOOLEAN NOT NULL DEFAULT true,
  "unitTag" TEXT,
  CONSTRAINT "KordleWord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KordleWord_locale_normalized_key" ON "KordleWord"("locale", "normalized");
CREATE INDEX "KordleWord_locale_length_isSolution_idx" ON "KordleWord"("locale", "length", "isSolution");
CREATE INDEX "KordleWord_locale_unitTag_idx" ON "KordleWord"("locale", "unitTag");

-- KordleGame: 1:1 with Board
CREATE TABLE "KordleGame" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "title" TEXT,
  "wordLength" INTEGER NOT NULL DEFAULT 5,
  "maxGuesses" INTEGER NOT NULL DEFAULT 6,
  "mode" "KordleGameMode" NOT NULL DEFAULT 'CLASSIC',
  "locale" TEXT NOT NULL DEFAULT 'ko-KR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KordleGame_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KordleGame_boardId_key" ON "KordleGame"("boardId");
ALTER TABLE "KordleGame" ADD CONSTRAINT "KordleGame_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- KordlePuzzle (now KordleWord already exists)
CREATE TABLE "KordlePuzzle" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "solutionWordId" TEXT NOT NULL,
  "status" "KordlePuzzleStatus" NOT NULL DEFAULT 'DRAFT',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "seed" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KordlePuzzle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KordlePuzzle_gameId_startsAt_idx" ON "KordlePuzzle"("gameId", "startsAt");
CREATE INDEX "KordlePuzzle_status_startsAt_idx" ON "KordlePuzzle"("status", "startsAt");
ALTER TABLE "KordlePuzzle" ADD CONSTRAINT "KordlePuzzle_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "KordleGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KordlePuzzle" ADD CONSTRAINT "KordlePuzzle_solutionWordId_fkey"
  FOREIGN KEY ("solutionWordId") REFERENCES "KordleWord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- KordleAttempt: per player per puzzle
CREATE TABLE "KordleAttempt" (
  "id" TEXT NOT NULL,
  "puzzleId" TEXT NOT NULL,
  "vibePlaySessionId" TEXT,
  "studentId" TEXT,
  "status" "KordleAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "solvedAtGuess" INTEGER,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "KordleAttempt_pkey" PRIMARY KEY ("id"),
  -- Exactly one of studentId / vibePlaySessionId must be set; can't both be null.
  CONSTRAINT "KordleAttempt_has_player_check"
    CHECK ("studentId" IS NOT NULL OR "vibePlaySessionId" IS NOT NULL)
);

CREATE INDEX "KordleAttempt_puzzleId_status_idx" ON "KordleAttempt"("puzzleId", "status");
CREATE INDEX "KordleAttempt_studentId_startedAt_idx" ON "KordleAttempt"("studentId", "startedAt");
ALTER TABLE "KordleAttempt" ADD CONSTRAINT "KordleAttempt_puzzleId_fkey"
  FOREIGN KEY ("puzzleId") REFERENCES "KordlePuzzle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KordleAttempt" ADD CONSTRAINT "KordleAttempt_vibePlaySessionId_fkey"
  FOREIGN KEY ("vibePlaySessionId") REFERENCES "VibePlaySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KordleAttempt" ADD CONSTRAINT "KordleAttempt_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One attempt per (puzzle, student) / (puzzle, session) — partial unique so
-- the null sibling column does not collide.
CREATE UNIQUE INDEX "KordleAttempt_puzzle_student_unique"
  ON "KordleAttempt"("puzzleId", "studentId")
  WHERE "studentId" IS NOT NULL;
CREATE UNIQUE INDEX "KordleAttempt_puzzle_session_unique"
  ON "KordleAttempt"("puzzleId", "vibePlaySessionId")
  WHERE "vibePlaySessionId" IS NOT NULL;

-- KordleGuess: one row per submitted guess
CREATE TABLE "KordleGuess" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "guessIndex" INTEGER NOT NULL,
  "guess" TEXT NOT NULL,
  "feedback" JSONB NOT NULL,
  "isCorrect" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KordleGuess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KordleGuess_attemptId_guessIndex_key" ON "KordleGuess"("attemptId", "guessIndex");
CREATE INDEX "KordleGuess_attemptId_createdAt_idx" ON "KordleGuess"("attemptId", "createdAt");
ALTER TABLE "KordleGuess" ADD CONSTRAINT "KordleGuess_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "KordleAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;