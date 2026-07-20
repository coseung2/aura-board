-- Expand activity-reward defaults without rewriting classroom-specific values.
-- The old schema had no customization marker, so values equal to the former
-- defaults are necessarily treated as defaults during this migration.
ALTER TABLE "AvatarRewardConfig"
  ALTER COLUMN "readingDailyRewardCap" SET DEFAULT 10,
  ALTER COLUMN "readingWeeklyRewardCap" SET DEFAULT 20,
  ALTER COLUMN "commentDailyRewardCap" SET DEFAULT 10,
  ALTER COLUMN "commentWeeklyRewardCap" SET DEFAULT 30,
  ALTER COLUMN "walkingDailyUnitCap" SET DEFAULT 4,
  ALTER COLUMN "assignmentDailyRewardCap" SET DEFAULT 0,
  ALTER COLUMN "assignmentWeeklyRewardCap" SET DEFAULT 0,
  ADD COLUMN "walkingWeeklyTier1Steps" INTEGER NOT NULL DEFAULT 25000,
  ADD COLUMN "walkingWeeklyTier1Amount" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "walkingWeeklyTier2Steps" INTEGER NOT NULL DEFAULT 50000,
  ADD COLUMN "walkingWeeklyTier2Amount" INTEGER NOT NULL DEFAULT 40,
  ADD COLUMN "walkingWeeklyTier3Steps" INTEGER NOT NULL DEFAULT 75000,
  ADD COLUMN "walkingWeeklyTier3Amount" INTEGER NOT NULL DEFAULT 100;

-- Preserve the old weekly goal's classroom-specific values as tier 1. Tier 2
-- and tier 3 are new policy entries and therefore use the reviewed defaults.
UPDATE "AvatarRewardConfig"
SET "walkingWeeklyTier1Steps" = "walkingWeeklyGoalSteps",
    "walkingWeeklyTier1Amount" = "walkingWeeklyGoalAmount";

-- Promote only rows that still carry the former defaults. A custom value that
-- happens to equal one of those numbers cannot be distinguished from a default
-- because the old table did not record an explicit-customization bit.
UPDATE "AvatarRewardConfig"
SET "readingDailyRewardCap" = 10
WHERE "readingDailyRewardCap" = 1;

UPDATE "AvatarRewardConfig"
SET "readingWeeklyRewardCap" = 20
WHERE "readingWeeklyRewardCap" = 2;

UPDATE "AvatarRewardConfig"
SET "commentDailyRewardCap" = 10
WHERE "commentDailyRewardCap" = 1;

UPDATE "AvatarRewardConfig"
SET "commentWeeklyRewardCap" = 30
WHERE "commentWeeklyRewardCap" = 2;

UPDATE "AvatarRewardConfig"
SET "walkingDailyUnitCap" = 4
WHERE "walkingDailyUnitCap" = 2;

-- Assignment rewards are paid for every valid submission by default. Existing
-- rows using the former bounded defaults move to the explicit unlimited value;
-- other classroom overrides are retained.
UPDATE "AvatarRewardConfig"
SET "assignmentDailyRewardCap" = 0
WHERE "assignmentDailyRewardCap" = 1;

UPDATE "AvatarRewardConfig"
SET "assignmentWeeklyRewardCap" = 0
WHERE "assignmentWeeklyRewardCap" = 2;

ALTER TABLE "AvatarRewardConfig"
  DROP COLUMN "walkingWeeklyGoalSteps",
  DROP COLUMN "walkingWeeklyGoalAmount";
