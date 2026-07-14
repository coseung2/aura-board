-- Source-specific transaction linkage for idempotent rewards/reversals.
-- Existing transactions remain unlinked (NULL) and are intentionally not
-- guessed during reading-log deletion.
ALTER TABLE "Transaction" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "sourceRef" TEXT;

CREATE UNIQUE INDEX "Transaction_sourceType_sourceRef_key"
    ON "Transaction"("sourceType", "sourceRef");
CREATE INDEX "Transaction_accountId_sourceType_sourceRef_idx"
    ON "Transaction"("accountId", "sourceType", "sourceRef");
