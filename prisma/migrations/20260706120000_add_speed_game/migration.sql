-- Speed Game (스피드게임, 2026-07-06)
--
-- Board(layout="speed-game") 보드 1개당 SpeedGame 1개, 1..N 라운드, 라운드별
-- 학생 답. 모둠은 기존 board default groups를 그대로 재사용(별도 team 테이블
-- 없음). status/answerMode는 String이라 추후 케이스 추가에 마이그레이션 불필요.
--
-- 주의:
--   * SpeedGameAnswer.groupId 는 String (FK 없음) — 런타임에 board default
--     groups join으로 검증. 다른 보드의 groupId를 넣어도 schema-level은 통과.
--   * SpeedGameAnswer 의 [roundId, groupId] 유니크 → 한 라운드에서 한 모둠
--     당 1개 답만 허용. 후속 시도는 update.
--   * SpeedGameWordSet 의 [userId, key] 유니크 + userId null = 시스템 세트.
--     NULL 끼리는 unique 비교에서 distinct 로 취급되므로 시스템/사용자 세트가
--     같은 key 를 가져도 OK.

CREATE TABLE "SpeedGameWordSet" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'ko',
    "keywords" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SpeedGameWordSet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpeedGameWordSet_userId_key_key" ON "SpeedGameWordSet"("userId", "key");
CREATE INDEX "SpeedGameWordSet_userId_idx" ON "SpeedGameWordSet"("userId");

ALTER TABLE "SpeedGameWordSet" ADD CONSTRAINT "SpeedGameWordSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SpeedGame" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'lobby',
    "roundIndex" INTEGER NOT NULL DEFAULT -1,
    "answerMode" TEXT NOT NULL DEFAULT 'exact',
    "baseScore" INTEGER NOT NULL DEFAULT 1000,
    "minScore" INTEGER NOT NULL DEFAULT 0,
    "bonusRanks" TEXT NOT NULL DEFAULT '300,200,100',
    "timeLimitMs" INTEGER NOT NULL DEFAULT 0,
    "activeStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SpeedGame_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpeedGame_boardId_key" ON "SpeedGame"("boardId");
CREATE INDEX "SpeedGame_status_idx" ON "SpeedGame"("status");

ALTER TABLE "SpeedGame" ADD CONSTRAINT "SpeedGame_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SpeedGameRound" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "keyword" TEXT NOT NULL,
    "keywordNormalized" TEXT NOT NULL,
    "guesserSlot" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpeedGameRound_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpeedGameRound_gameId_order_key" ON "SpeedGameRound"("gameId", "order");
CREATE INDEX "SpeedGameRound_gameId_idx" ON "SpeedGameRound"("gameId");

ALTER TABLE "SpeedGameRound" ADD CONSTRAINT "SpeedGameRound_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "SpeedGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SpeedGameAnswer" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER NOT NULL DEFAULT 0,
    "approval" TEXT NOT NULL DEFAULT 'pending',
    "rawText" TEXT NOT NULL,
    "elapsedMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SpeedGameAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpeedGameAnswer_roundId_groupId_key" ON "SpeedGameAnswer"("roundId", "groupId");
CREATE INDEX "SpeedGameAnswer_roundId_idx" ON "SpeedGameAnswer"("roundId");
CREATE INDEX "SpeedGameAnswer_studentId_idx" ON "SpeedGameAnswer"("studentId");
CREATE INDEX "SpeedGameAnswer_groupId_idx" ON "SpeedGameAnswer"("groupId");

ALTER TABLE "SpeedGameAnswer" ADD CONSTRAINT "SpeedGameAnswer_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "SpeedGameRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpeedGameAnswer" ADD CONSTRAINT "SpeedGameAnswer_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
