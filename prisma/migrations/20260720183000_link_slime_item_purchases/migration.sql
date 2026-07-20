ALTER TABLE "StudentCreatureItem"
ADD COLUMN IF NOT EXISTS "purchaseTransactionId" TEXT;

WITH latest_purchase AS (
  SELECT DISTINCT ON (sci."id")
    sci."id" AS "inventoryId",
    transaction_row."id" AS "transactionId"
  FROM "StudentCreatureItem" sci
  JOIN "StudentAccount" account
    ON account."studentId" = sci."studentId"
  JOIN "Transaction" transaction_row
    ON transaction_row."accountId" = account."id"
   AND transaction_row."sourceType" = 'slime_item_purchase'
   AND transaction_row."type" = 'slime_item_purchase'
   AND transaction_row."note" = 'slime-item-purchase:' || sci."itemKey"
  WHERE sci."quantity" > 0
    AND sci."itemKind" LIKE 'slime-%'
  ORDER BY sci."id", transaction_row."createdAt" DESC, transaction_row."id" DESC
)
UPDATE "StudentCreatureItem" inventory
SET "purchaseTransactionId" = latest_purchase."transactionId"
FROM latest_purchase
WHERE inventory."id" = latest_purchase."inventoryId";

CREATE UNIQUE INDEX IF NOT EXISTS "StudentCreatureItem_purchaseTransactionId_key"
ON "StudentCreatureItem"("purchaseTransactionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'StudentCreatureItem_purchaseTransactionId_fkey'
  ) THEN
    ALTER TABLE "StudentCreatureItem"
    ADD CONSTRAINT "StudentCreatureItem_purchaseTransactionId_fkey"
    FOREIGN KEY ("purchaseTransactionId") REFERENCES "Transaction"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
