-- Separate the student's displayed pet from the active growth slot.
ALTER TABLE "StudentCreature"
    ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- Give existing students a deterministic non-egg representative. The most
-- advanced, most recently updated pet wins; eggs are incubation state only.
WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "studentId"
            ORDER BY
                CASE "stage"
                    WHEN 'evolved' THEN 3
                    WHEN 'juvenile' THEN 2
                    WHEN 'hatchling' THEN 1
                    ELSE 0
                END DESC,
                "updatedAt" DESC,
                "createdAt" DESC,
                "id" DESC
        ) AS position
    FROM "StudentCreature"
    WHERE "stage" <> 'egg'
)
UPDATE "StudentCreature" AS creature
SET "isFeatured" = true
FROM ranked
WHERE creature."id" = ranked."id"
  AND ranked.position = 1;

ALTER TABLE "StudentCreature"
    ADD CONSTRAINT "StudentCreature_featured_must_be_hatched_check"
    CHECK (NOT "isFeatured" OR "stage" <> 'egg');

CREATE UNIQUE INDEX "StudentCreature_studentId_featured_key"
    ON "StudentCreature"("studentId")
    WHERE "isFeatured" = true;
