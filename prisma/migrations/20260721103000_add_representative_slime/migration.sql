ALTER TABLE "StudentSlime"
ADD COLUMN "isRepresentative" BOOLEAN NOT NULL DEFAULT false;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "studentId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS position
  FROM "StudentSlime"
)
UPDATE "StudentSlime" AS slime
SET "isRepresentative" = true
FROM ranked
WHERE slime."id" = ranked."id"
  AND ranked.position = 1;

CREATE INDEX "StudentSlime_studentId_isRepresentative_idx"
ON "StudentSlime"("studentId", "isRepresentative");

CREATE UNIQUE INDEX "StudentSlime_one_representative_per_student"
ON "StudentSlime"("studentId")
WHERE "isRepresentative" = true;
