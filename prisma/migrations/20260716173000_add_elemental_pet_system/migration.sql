-- Elemental pet system (2026-07-16)
--
-- This migration is intentionally additive and keeps StudentAccount + Transaction
-- as the classroom-currency source of truth. The models are declared in
-- prisma/pets.prisma, while mutations use the narrow parameterized transaction
-- boundary in src/lib/pets/server.ts.

CREATE TABLE "StudentPet" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "nickname" TEXT,
    "hatchProgress" INTEGER NOT NULL DEFAULT 0,
    "hatchRequired" INTEGER NOT NULL DEFAULT 100,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "backgroundKey" TEXT,
    "acquiredVia" TEXT NOT NULL DEFAULT 'purchase',
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hatchedAt" TIMESTAMP(3),
    "evolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentPet_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudentPet_stage_check" CHECK ("stage" >= 0 AND "stage" <= 3),
    CONSTRAINT "StudentPet_hatchProgress_check" CHECK ("hatchProgress" >= 0),
    CONSTRAINT "StudentPet_hatchRequired_check" CHECK ("hatchRequired" > 0),
    CONSTRAINT "StudentPet_experience_check" CHECK ("experience" >= 0)
);

CREATE TABLE "StudentPetItem" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentPetItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudentPetItem_quantity_check" CHECK ("quantity" >= 0)
);

CREATE TABLE "PetPurchase" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "productKind" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "transactionId" TEXT,
    "resultPetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetPurchase_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PetPurchase_unitPrice_check" CHECK ("unitPrice" >= 0),
    CONSTRAINT "PetPurchase_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "PetPurchase_productKind_check" CHECK ("productKind" IN ('egg', 'food', 'accelerator', 'background'))
);

CREATE INDEX "StudentPet_studentId_acquiredAt_idx"
    ON "StudentPet"("studentId", "acquiredAt");
CREATE INDEX "StudentPet_studentId_lineageId_idx"
    ON "StudentPet"("studentId", "lineageId");
CREATE UNIQUE INDEX "StudentPet_one_equipped_per_student_key"
    ON "StudentPet"("studentId") WHERE "equipped" = true;

CREATE UNIQUE INDEX "StudentPetItem_studentId_itemKey_key"
    ON "StudentPetItem"("studentId", "itemKey");
CREATE INDEX "StudentPetItem_studentId_idx"
    ON "StudentPetItem"("studentId");

CREATE UNIQUE INDEX "PetPurchase_transactionId_key"
    ON "PetPurchase"("transactionId");
CREATE UNIQUE INDEX "PetPurchase_resultPetId_key"
    ON "PetPurchase"("resultPetId");
CREATE INDEX "PetPurchase_studentId_createdAt_idx"
    ON "PetPurchase"("studentId", "createdAt");
CREATE INDEX "PetPurchase_productKey_idx"
    ON "PetPurchase"("productKey");

ALTER TABLE "StudentPet"
    ADD CONSTRAINT "StudentPet_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentPetItem"
    ADD CONSTRAINT "StudentPetItem_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PetPurchase"
    ADD CONSTRAINT "PetPurchase_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PetPurchase"
    ADD CONSTRAINT "PetPurchase_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PetPurchase"
    ADD CONSTRAINT "PetPurchase_resultPetId_fkey"
    FOREIGN KEY ("resultPetId") REFERENCES "StudentPet"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
