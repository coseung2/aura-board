-- Persist the passive slime timer independently for every owned slime.
-- Existing ownership rows start at stage one with no elapsed progress and use
-- a paused (zero) rate until the service settles/applies their equipped rate.
ALTER TABLE "StudentSlime"
  ADD COLUMN "growthStage" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "growthSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "growthRemainderBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "growthLastSettledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "growthAppliedSpeedBps" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "StudentSlime"
  ADD CONSTRAINT "StudentSlime_growthStage_check"
    CHECK ("growthStage" BETWEEN 1 AND 3),
  ADD CONSTRAINT "StudentSlime_growthSeconds_check"
    CHECK ("growthSeconds" >= 0),
  ADD CONSTRAINT "StudentSlime_growthRemainderBps_check"
    CHECK ("growthRemainderBps" BETWEEN 0 AND 9999),
  ADD CONSTRAINT "StudentSlime_growthAppliedSpeedBps_check"
    CHECK ("growthAppliedSpeedBps" >= 0);

-- Existing equipped blue slimes already carry the catalog's 200 bps
-- growth_speed effect.  Seed that applied rate at the migration cursor so
-- their timers begin from the migration timestamp rather than staying paused
-- until the student manually toggles equipment.
UPDATE "StudentSlime" AS target
SET "growthAppliedSpeedBps" = CASE
  WHEN target."isEquipped" = true
   AND EXISTS (
     SELECT 1
     FROM "StudentSlime" AS equipped
     WHERE equipped."studentId" = target."studentId"
       AND equipped."isEquipped" = true
       AND equipped."color" = 'blue'
   )
  THEN 200
  ELSE 0
END;
