ALTER TABLE "CardComment"
ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "CardComment_authorStudentId_cardId_clientRequestId_key"
ON "CardComment"("authorStudentId", "cardId", "clientRequestId");

ALTER TABLE "StudentSlime"
ADD COLUMN "isEquipped" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "AvatarRewardConfig"
ALTER COLUMN "readingRewardPerPoint" SET DEFAULT 5,
ALTER COLUMN "walkingRewardAmount" SET DEFAULT 10,
ADD COLUMN "readingDailyRewardCap" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "readingWeeklyRewardCap" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "commentRewardAmount" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "commentDailyRewardCap" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "commentWeeklyRewardCap" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "commentMinMeaningfulLength" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN "walkingDailyUnitCap" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "walkingWeeklyRewardDayCap" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "walkingWeeklyGoalSteps" INTEGER NOT NULL DEFAULT 25000,
ADD COLUMN "walkingWeeklyGoalAmount" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN "assignmentDailyRewardCap" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "assignmentWeeklyRewardCap" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "rewardBuffCapBps" INTEGER NOT NULL DEFAULT 2000;

-- The old schema defaults were 10 per reading point and 20 per walking unit.
-- There is no historical "explicitly customized" marker, so only rows still
-- equal to those exact former defaults are migrated. Deliberately different
-- classroom values are preserved.
UPDATE "AvatarRewardConfig"
SET "readingRewardPerPoint" = 5
WHERE "readingRewardPerPoint" = 10;

UPDATE "AvatarRewardConfig"
SET "walkingRewardAmount" = 10
WHERE "walkingRewardAmount" = 20;
