ALTER TABLE "Card" ADD COLUMN "guidePinned" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Card_sectionId_guidePinned_idx" ON "Card"("sectionId", "guidePinned");
