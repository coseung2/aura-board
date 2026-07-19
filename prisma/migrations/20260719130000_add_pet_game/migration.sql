CREATE TABLE "PetSpecies" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "rarity" TEXT NOT NULL,
  "stage" INTEGER NOT NULL,
  "familyKey" TEXT NOT NULL,
  "effectKey" TEXT NOT NULL,
  "baseEffectBps" INTEGER NOT NULL,
  "spriteKey" TEXT NOT NULL,
  "hatchWeight" INTEGER NOT NULL DEFAULT 0,
  "nextEvolutionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PetSpecies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PetSpecies_stage_check" CHECK ("stage" >= 0),
  CONSTRAINT "PetSpecies_baseEffectBps_check" CHECK ("baseEffectBps" >= 0),
  CONSTRAINT "PetSpecies_hatchWeight_check" CHECK ("hatchWeight" >= 0)
);

CREATE TABLE "StudentPet" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "speciesId" TEXT NOT NULL,
  "enhancementLevel" INTEGER NOT NULL DEFAULT 0,
  "evolutionXp" INTEGER NOT NULL DEFAULT 0,
  "shards" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentPet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentPet_enhancement_check" CHECK ("enhancementLevel" BETWEEN 0 AND 10),
  CONSTRAINT "StudentPet_evolutionXp_check" CHECK ("evolutionXp" >= 0),
  CONSTRAINT "StudentPet_shards_check" CHECK ("shards" >= 0)
);

CREATE TABLE "PetDexEntry" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "speciesId" TEXT NOT NULL,
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PetDexEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentEgg" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "resultSpeciesId" TEXT NOT NULL,
  "eggType" TEXT NOT NULL,
  "eggName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'incubating',
  "baseHatchSeconds" INTEGER NOT NULL,
  "progressSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lastProgressAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hatchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentEgg_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentEgg_status_check" CHECK ("status" IN ('incubating', 'hatched')),
  CONSTRAINT "StudentEgg_baseHatchSeconds_check" CHECK ("baseHatchSeconds" > 0),
  CONSTRAINT "StudentEgg_progressSeconds_check" CHECK ("progressSeconds" >= 0)
);

CREATE TABLE "PetSynergyLoadout" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PetSynergyLoadout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PetSynergySlot" (
  "id" TEXT NOT NULL,
  "loadoutId" TEXT NOT NULL,
  "petId" TEXT NOT NULL,
  "slotIndex" INTEGER NOT NULL,
  CONSTRAINT "PetSynergySlot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PetSynergySlot_slot_check" CHECK ("slotIndex" BETWEEN 0 AND 4)
);

CREATE TABLE "PetActivityGrant" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "baseXp" INTEGER NOT NULL,
  "awardedXp" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PetActivityGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PetActivityGrant_xp_check" CHECK ("baseXp" >= 0 AND "awardedXp" >= 0)
);

CREATE UNIQUE INDEX "PetSpecies_key_key" ON "PetSpecies"("key");
CREATE UNIQUE INDEX "PetSpecies_nextEvolutionId_key" ON "PetSpecies"("nextEvolutionId");
CREATE INDEX "PetSpecies_type_stage_idx" ON "PetSpecies"("type", "stage");
CREATE INDEX "PetSpecies_familyKey_stage_idx" ON "PetSpecies"("familyKey", "stage");
CREATE UNIQUE INDEX "StudentPet_studentId_speciesId_key" ON "StudentPet"("studentId", "speciesId");
CREATE INDEX "StudentPet_studentId_idx" ON "StudentPet"("studentId");
CREATE UNIQUE INDEX "PetDexEntry_studentId_speciesId_key" ON "PetDexEntry"("studentId", "speciesId");
CREATE INDEX "PetDexEntry_studentId_idx" ON "PetDexEntry"("studentId");
CREATE INDEX "StudentEgg_studentId_status_idx" ON "StudentEgg"("studentId", "status");
CREATE UNIQUE INDEX "StudentEgg_one_active_per_student_key" ON "StudentEgg"("studentId") WHERE "status" = 'incubating';
CREATE UNIQUE INDEX "PetSynergyLoadout_studentId_key" ON "PetSynergyLoadout"("studentId");
CREATE UNIQUE INDEX "PetSynergySlot_loadoutId_slotIndex_key" ON "PetSynergySlot"("loadoutId", "slotIndex");
CREATE UNIQUE INDEX "PetSynergySlot_loadoutId_petId_key" ON "PetSynergySlot"("loadoutId", "petId");
CREATE INDEX "PetSynergySlot_petId_idx" ON "PetSynergySlot"("petId");
CREATE UNIQUE INDEX "PetActivityGrant_studentId_sourceType_sourceRef_key" ON "PetActivityGrant"("studentId", "sourceType", "sourceRef");
CREATE INDEX "PetActivityGrant_studentId_createdAt_idx" ON "PetActivityGrant"("studentId", "createdAt");

ALTER TABLE "PetSpecies" ADD CONSTRAINT "PetSpecies_nextEvolutionId_fkey" FOREIGN KEY ("nextEvolutionId") REFERENCES "PetSpecies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentPet" ADD CONSTRAINT "StudentPet_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentPet" ADD CONSTRAINT "StudentPet_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "PetSpecies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PetDexEntry" ADD CONSTRAINT "PetDexEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetDexEntry" ADD CONSTRAINT "PetDexEntry_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "PetSpecies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentEgg" ADD CONSTRAINT "StudentEgg_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentEgg" ADD CONSTRAINT "StudentEgg_resultSpeciesId_fkey" FOREIGN KEY ("resultSpeciesId") REFERENCES "PetSpecies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PetSynergyLoadout" ADD CONSTRAINT "PetSynergyLoadout_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetSynergySlot" ADD CONSTRAINT "PetSynergySlot_loadoutId_fkey" FOREIGN KEY ("loadoutId") REFERENCES "PetSynergyLoadout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetSynergySlot" ADD CONSTRAINT "PetSynergySlot_petId_fkey" FOREIGN KEY ("petId") REFERENCES "StudentPet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetActivityGrant" ADD CONSTRAINT "PetActivityGrant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."PetSpecies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StudentPet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PetDexEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StudentEgg" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PetSynergyLoadout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PetSynergySlot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PetActivityGrant" ENABLE ROW LEVEL SECURITY;
