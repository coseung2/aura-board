ALTER TABLE "StudentSlime"
ADD COLUMN "equippedItemKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Preserve the previous account-wide equipment by assigning it to the oldest
-- owned slime. New changes are stored explicitly per slime.
WITH first_slime AS (
  SELECT DISTINCT ON ("studentId") "id", "studentId"
  FROM "StudentSlime"
  ORDER BY "studentId", "createdAt" ASC
), equipped AS (
  SELECT "studentId", array_agg("itemKey" ORDER BY "itemKey") AS keys
  FROM "StudentCreatureItem"
  WHERE "isEquipped" = TRUE
    AND "quantity" > 0
    AND "itemKind" LIKE 'slime-%'
  GROUP BY "studentId"
)
UPDATE "StudentSlime" slime
SET "equippedItemKeys" = equipped.keys
FROM first_slime, equipped
WHERE slime."id" = first_slime."id"
  AND first_slime."studentId" = equipped."studentId";
