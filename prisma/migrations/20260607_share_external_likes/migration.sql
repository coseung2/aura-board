ALTER TABLE "CardLike" ADD COLUMN "externalLikerKey" TEXT;

CREATE UNIQUE INDEX "CardLike_cardId_externalLikerKey_key"
  ON "CardLike"("cardId", "externalLikerKey");
