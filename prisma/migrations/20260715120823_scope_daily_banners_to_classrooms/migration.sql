-- Scope daily banner publications to one banner per classroom and KST day.
-- Existing global publications keep the classroom of their source submission.

ALTER TABLE "DailyBannerPublication"
  ADD COLUMN "classroomId" TEXT;

-- Keep approvals from an older application instance working during a rolling
-- deploy. The compound foreign key added below remains the final integrity
-- gate; this trigger only derives the newly required scope column.
CREATE OR REPLACE FUNCTION public.sync_daily_banner_publication_classroom()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  source_classroom_id TEXT;
BEGIN
  SELECT submission."classroomId"
    INTO source_classroom_id
  FROM public."DailyBannerSubmission" AS submission
  WHERE submission."id" = NEW."submissionId";

  IF source_classroom_id IS NULL THEN
    RAISE EXCEPTION 'Daily banner submission does not exist'
      USING ERRCODE = '23503';
  END IF;

  NEW."classroomId" := source_classroom_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_daily_banner_publication_classroom()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "DailyBannerPublication_sync_classroom"
BEFORE INSERT OR UPDATE OF "submissionId"
ON public."DailyBannerPublication"
FOR EACH ROW
EXECUTE FUNCTION public.sync_daily_banner_publication_classroom();

UPDATE "DailyBannerPublication" AS publication
SET "classroomId" = submission."classroomId"
FROM "DailyBannerSubmission" AS submission
WHERE submission."id" = publication."submissionId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "DailyBannerPublication" AS publication
    LEFT JOIN "DailyBannerSubmission" AS submission
      ON submission."id" = publication."submissionId"
    WHERE publication."classroomId" IS NULL
       OR publication."day" <> submission."targetDay"
       OR submission."status" <> 'approved'
  ) THEN
    RAISE EXCEPTION 'Daily banner publication history is inconsistent';
  END IF;
END $$;

ALTER TABLE "DailyBannerPublication"
  ALTER COLUMN "classroomId" SET NOT NULL;

CREATE UNIQUE INDEX "DailyBannerSubmission_id_classroomId_targetDay_key"
  ON "DailyBannerSubmission"("id", "classroomId", "targetDay");

ALTER TABLE "DailyBannerPublication"
  DROP CONSTRAINT "DailyBannerPublication_submissionId_fkey",
  ADD CONSTRAINT "DailyBannerPublication_submissionId_classroomId_day_fkey"
    FOREIGN KEY ("submissionId", "classroomId", "day")
    REFERENCES "DailyBannerSubmission"("id", "classroomId", "targetDay")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "DailyBannerPublication_classroomId_day_key"
  ON "DailyBannerPublication"("classroomId", "day");

CREATE UNIQUE INDEX "DailyBannerPublication_submissionId_classroomId_day_key"
  ON "DailyBannerPublication"("submissionId", "classroomId", "day");

CREATE INDEX "DailyBannerPublication_day_idx"
  ON "DailyBannerPublication"("day");

DROP INDEX "DailyBannerPublication_day_key";
