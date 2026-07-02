-- Avatar customization MVP (2026-07-02)
-- Self-contained character layer. Wallet source of truth stays
-- StudentAccount.balance + Transaction; avatar purchases reuse the same
-- Transaction table with `type = "avatar_purchase"`. All additive: existing
-- tables/columns untouched.
--
-- Notes on data shape:
--  * AvatarItem.classroomId NULL => system/default catalog (available to all
--    classrooms). Non-null => teacher-uploaded item for that classroom.
--  * (classroomId, key) is uniquely indexed. NULL is treated as distinct
--    by both SQLite and Postgres, so app code gates system-item uniqueness
--    on `key` alone.
--  * AvatarPurchase.transactionId is unique so each Transaction is linked
--    to at most one AvatarPurchase (1:1).

CREATE TABLE "AvatarItem" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "slot" TEXT,
    "rarity" TEXT NOT NULL DEFAULT 'common',
    "price" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "metadata" JSONB,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AvatarItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AvatarItem_classroomId_key_key" ON "AvatarItem"("classroomId", "key");
CREATE INDEX "AvatarItem_classroomId_archived_idx" ON "AvatarItem"("classroomId", "archived");
CREATE INDEX "AvatarItem_category_archived_idx" ON "AvatarItem"("category", "archived");

ALTER TABLE "AvatarItem" ADD CONSTRAINT "AvatarItem_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AvatarInventoryItem" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "acquiredVia" TEXT NOT NULL DEFAULT 'purchase',
    "sourceRef" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AvatarInventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AvatarInventoryItem_studentId_itemId_key" ON "AvatarInventoryItem"("studentId", "itemId");
CREATE INDEX "AvatarInventoryItem_studentId_idx" ON "AvatarInventoryItem"("studentId");

ALTER TABLE "AvatarInventoryItem" ADD CONSTRAINT "AvatarInventoryItem_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvatarInventoryItem" ADD CONSTRAINT "AvatarInventoryItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AvatarItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AvatarLoadout" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AvatarLoadout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AvatarLoadout_studentId_key" ON "AvatarLoadout"("studentId");

ALTER TABLE "AvatarLoadout" ADD CONSTRAINT "AvatarLoadout_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AvatarLoadoutItem" (
    "id" TEXT NOT NULL,
    "loadoutId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "itemId" TEXT,
    CONSTRAINT "AvatarLoadoutItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AvatarLoadoutItem_loadoutId_slot_key" ON "AvatarLoadoutItem"("loadoutId", "slot");
CREATE INDEX "AvatarLoadoutItem_loadoutId_idx" ON "AvatarLoadoutItem"("loadoutId");

ALTER TABLE "AvatarLoadoutItem" ADD CONSTRAINT "AvatarLoadoutItem_loadoutId_fkey" FOREIGN KEY ("loadoutId") REFERENCES "AvatarLoadout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvatarLoadoutItem" ADD CONSTRAINT "AvatarLoadoutItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AvatarItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AvatarPurchase" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'succeeded',
    "transactionId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AvatarPurchase_pkey" PRIMARY KEY ("id")
);

-- transactionId is unique so each Transaction is linked to at most one
-- AvatarPurchase (1:1 audit linkage).
CREATE UNIQUE INDEX "AvatarPurchase_transactionId_key" ON "AvatarPurchase"("transactionId");
CREATE INDEX "AvatarPurchase_studentId_createdAt_idx" ON "AvatarPurchase"("studentId", "createdAt");
CREATE INDEX "AvatarPurchase_itemId_idx" ON "AvatarPurchase"("itemId");

ALTER TABLE "AvatarPurchase" ADD CONSTRAINT "AvatarPurchase_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvatarPurchase" ADD CONSTRAINT "AvatarPurchase_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AvatarItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvatarPurchase" ADD CONSTRAINT "AvatarPurchase_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AvatarRewardConfig" (
    "classroomId" TEXT NOT NULL,
    "readingRewardPerPoint" INTEGER NOT NULL DEFAULT 10,
    "readingMinScoreForPayout" INTEGER NOT NULL DEFAULT 5,
    CONSTRAINT "AvatarRewardConfig_pkey" PRIMARY KEY ("classroomId")
);

ALTER TABLE "AvatarRewardConfig" ADD CONSTRAINT "AvatarRewardConfig_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AvatarGalleryEntry" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "visibleFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "AvatarGalleryEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AvatarGalleryEntry_classroomId_studentId_key" ON "AvatarGalleryEntry"("classroomId", "studentId");
CREATE INDEX "AvatarGalleryEntry_classroomId_revokedAt_idx" ON "AvatarGalleryEntry"("classroomId", "revokedAt");

ALTER TABLE "AvatarGalleryEntry" ADD CONSTRAINT "AvatarGalleryEntry_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvatarGalleryEntry" ADD CONSTRAINT "AvatarGalleryEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;