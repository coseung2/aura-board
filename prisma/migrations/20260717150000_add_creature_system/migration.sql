-- Aura creature system v1.
-- Static line/stage/product/catalog data stays in src/lib/creatures/catalog.ts;
-- these tables persist only server-authoritative student state and audit rows.

CREATE TABLE "StudentCreature" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'egg',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "progressPoints" INTEGER NOT NULL DEFAULT 0,
    "rulesVersion" TEXT NOT NULL DEFAULT 'creature-rules-v1',
    "catalogRevision" TEXT NOT NULL,
    "purchaseMode" TEXT NOT NULL,
    "oddsSnapshot" JSONB,
    "originSourceType" TEXT NOT NULL,
    "originSourceRef" TEXT NOT NULL,
    "purchaseTransactionId" TEXT NOT NULL,
    "incubatingStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hatchedAt" TIMESTAMP(3),
    "juvenileAt" TIMESTAMP(3),
    "evolvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentCreature_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudentCreature_progressPoints_nonnegative_check"
      CHECK ("progressPoints" >= 0),
    CONSTRAINT "StudentCreature_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentCreature_classroomId_fkey"
      FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentCreature_purchaseTransactionId_fkey"
      FOREIGN KEY ("purchaseTransactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StudentCreature_purchaseTransactionId_key"
    ON "StudentCreature"("purchaseTransactionId");
CREATE UNIQUE INDEX "StudentCreature_originSourceType_originSourceRef_key"
    ON "StudentCreature"("originSourceType", "originSourceRef");
CREATE INDEX "StudentCreature_studentId_isActive_idx"
    ON "StudentCreature"("studentId", "isActive");
CREATE INDEX "StudentCreature_studentId_lineKey_idx"
    ON "StudentCreature"("studentId", "lineKey");
CREATE INDEX "StudentCreature_classroomId_idx"
    ON "StudentCreature"("classroomId");
CREATE UNIQUE INDEX "StudentCreature_studentId_active_key"
    ON "StudentCreature"("studentId")
    WHERE "isActive" = true;

CREATE TABLE "CreatureProgressEvent" (
    "id" TEXT NOT NULL,
    "studentCreatureId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "currencyAmount" INTEGER NOT NULL,
    "progressDelta" INTEGER NOT NULL,
    "progressBefore" INTEGER NOT NULL,
    "progressAfter" INTEGER NOT NULL,
    "stageBefore" TEXT NOT NULL,
    "stageAfter" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "CreatureProgressEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreatureProgressEvent_currencyAmount_nonnegative_check"
      CHECK ("currencyAmount" >= 0),
    CONSTRAINT "CreatureProgressEvent_progressDelta_nonnegative_check"
      CHECK ("progressDelta" >= 0),
    CONSTRAINT "CreatureProgressEvent_progressBefore_nonnegative_check"
      CHECK ("progressBefore" >= 0),
    CONSTRAINT "CreatureProgressEvent_progressAfter_nonnegative_check"
      CHECK ("progressAfter" >= 0),
    CONSTRAINT "CreatureProgressEvent_studentCreatureId_fkey"
      FOREIGN KEY ("studentCreatureId") REFERENCES "StudentCreature"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreatureProgressEvent_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreatureProgressEvent_classroomId_fkey"
      FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CreatureProgressEvent_idempotencyKey_key"
    ON "CreatureProgressEvent"("idempotencyKey");
CREATE UNIQUE INDEX "CreatureProgressEvent_studentId_sourceType_sourceRef_key"
    ON "CreatureProgressEvent"("studentId", "sourceType", "sourceRef");
CREATE INDEX "CreatureProgressEvent_studentCreatureId_appliedAt_idx"
    ON "CreatureProgressEvent"("studentCreatureId", "appliedAt");
CREATE INDEX "CreatureProgressEvent_classroomId_idx"
    ON "CreatureProgressEvent"("classroomId");

CREATE TABLE "StudentCreatureItem" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "itemKind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "isEquipped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentCreatureItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudentCreatureItem_quantity_nonnegative_check"
      CHECK ("quantity" >= 0),
    CONSTRAINT "StudentCreatureItem_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentCreatureItem_classroomId_fkey"
      FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StudentCreatureItem_studentId_itemKey_key"
    ON "StudentCreatureItem"("studentId", "itemKey");
CREATE INDEX "StudentCreatureItem_studentId_itemKind_idx"
    ON "StudentCreatureItem"("studentId", "itemKind");
CREATE INDEX "StudentCreatureItem_classroomId_idx"
    ON "StudentCreatureItem"("classroomId");
CREATE UNIQUE INDEX "StudentCreatureItem_studentId_equipped_background_key"
    ON "StudentCreatureItem"("studentId")
    WHERE "isEquipped" = true AND "itemKind" = 'background-effect';

CREATE TABLE "CreatureItemUse" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "studentCreatureId" TEXT,
    "inventoryItemId" TEXT,
    "itemKey" TEXT NOT NULL,
    "itemKind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "effectSnapshot" JSONB NOT NULL,
    "progressBefore" INTEGER NOT NULL,
    "progressAfter" INTEGER NOT NULL,
    "stageBefore" TEXT NOT NULL,
    "stageAfter" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'creature_item_use',
    "sourceRef" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatureItemUse_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreatureItemUse_quantity_positive_check"
      CHECK ("quantity" > 0),
    CONSTRAINT "CreatureItemUse_progressBefore_nonnegative_check"
      CHECK ("progressBefore" >= 0),
    CONSTRAINT "CreatureItemUse_progressAfter_nonnegative_check"
      CHECK ("progressAfter" >= 0),
    CONSTRAINT "CreatureItemUse_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreatureItemUse_classroomId_fkey"
      FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreatureItemUse_studentCreatureId_fkey"
      FOREIGN KEY ("studentCreatureId") REFERENCES "StudentCreature"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CreatureItemUse_inventoryItemId_fkey"
      FOREIGN KEY ("inventoryItemId") REFERENCES "StudentCreatureItem"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CreatureItemUse_idempotencyKey_key"
    ON "CreatureItemUse"("idempotencyKey");
CREATE UNIQUE INDEX "CreatureItemUse_studentId_sourceType_sourceRef_key"
    ON "CreatureItemUse"("studentId", "sourceType", "sourceRef");
CREATE INDEX "CreatureItemUse_studentCreatureId_usedAt_idx"
    ON "CreatureItemUse"("studentCreatureId", "usedAt");
CREATE INDEX "CreatureItemUse_classroomId_idx"
    ON "CreatureItemUse"("classroomId");

-- Activity reward policy seeds. Teacher settings can edit these values later;
-- non-positive values safely disable the corresponding reward in the routes.
ALTER TABLE "AvatarRewardConfig"
    ADD COLUMN "walkingRewardStepThreshold" INTEGER NOT NULL DEFAULT 5000;
ALTER TABLE "AvatarRewardConfig"
    ADD COLUMN "walkingRewardAmount" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "AvatarRewardConfig"
    ADD COLUMN "assignmentRewardAmount" INTEGER NOT NULL DEFAULT 20;

-- These public-schema tables are accessed only through the server-owned
-- Prisma routes. Enable RLS without public policies so Supabase Data API roles
-- cannot read or mutate classroom creature state directly.
ALTER TABLE "StudentCreature" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreatureProgressEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentCreatureItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreatureItemUse" ENABLE ROW LEVEL SECURITY;
