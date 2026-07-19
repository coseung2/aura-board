import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureAccountFor } from "@/lib/bank";
import { PET_EGG_SHOP, ensureDefaultPetSpecies } from "./catalog";
import { calculatePetEffects, effectivePetBuffBps, projectIncubation } from "./math";
import type { PetEffectKey, PetHomePayload, PetSpeciesPayload } from "./types";

type DbClient = Prisma.TransactionClient | PrismaClient;
type StudentIdentity = { id: string; classroomId: string; name: string };

export class PetDomainError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = "PetDomainError";
  }
}

function speciesPayload(species: {
  id: string; key: string; name: string; type: string; rarity: string; stage: number;
  familyKey: string; effectKey: string; spriteKey: string; nextEvolutionId: string | null;
}): PetSpeciesPayload {
  return {
    id: species.id,
    key: species.key,
    name: species.name,
    type: species.type,
    rarity: species.rarity,
    stage: species.stage,
    familyKey: species.familyKey,
    effectKey: species.effectKey as PetEffectKey,
    spriteKey: species.spriteKey,
    nextEvolutionId: species.nextEvolutionId,
  };
}

async function loadoutBuffPets(client: DbClient, studentId: string) {
  const loadout = await client.petSynergyLoadout.findUnique({
    where: { studentId },
    include: {
      slots: {
        orderBy: { slotIndex: "asc" },
        include: { pet: { include: { species: true } } },
      },
    },
  });
  return {
    petIds: loadout?.slots.map((slot) => slot.petId) ?? [],
    pets: loadout?.slots.map(({ pet }) => ({
      type: pet.species.type,
      effectKey: pet.species.effectKey as PetEffectKey,
      label: pet.species.name,
      baseEffectBps: pet.species.baseEffectBps,
      stage: pet.species.stage,
      enhancementLevel: pet.enhancementLevel,
    })) ?? [],
  };
}

export async function getStudentPetEffects(client: DbClient, studentId: string) {
  const loadout = await loadoutBuffPets(client, studentId);
  return { ...calculatePetEffects(loadout.pets), petIds: loadout.petIds };
}

export async function settleActiveEgg(
  tx: Prisma.TransactionClient,
  studentId: string,
  now = new Date(),
) {
  const effects = await getStudentPetEffects(tx, studentId);
  const egg = await tx.studentEgg.findFirst({
    where: { studentId, status: "incubating" },
  });
  if (!egg) return null;
  const projection = projectIncubation({
    progressSeconds: egg.progressSeconds,
    lastProgressAt: egg.lastProgressAt,
    asOf: now,
    baseHatchSeconds: egg.baseHatchSeconds,
    hatchSpeedBps: effects.hatchSpeedBps,
  });
  return tx.studentEgg.update({
    where: { id: egg.id },
    data: { progressSeconds: projection.progressSeconds, lastProgressAt: now },
  });
}

export function evolutionXpRequired(stage: number) {
  if (stage === 0) return 100;
  if (stage === 1) return 250;
  return 250 + (stage - 1) * 200;
}

function enhancementCost(level: number) {
  const next = level + 1;
  return { currency: next * 50, shards: next };
}

export async function getPetHome(student: StudentIdentity): Promise<PetHomePayload> {
  await ensureDefaultPetSpecies();
  const { accountId } = await ensureAccountFor(student);
  const now = new Date();
  const [account, currency, species, pets, dex, loadout, egg] = await Promise.all([
    db.studentAccount.findUniqueOrThrow({ where: { id: accountId }, select: { balance: true } }),
    db.classroomCurrency.findUnique({ where: { classroomId: student.classroomId }, select: { unitLabel: true } }),
    db.petSpecies.findMany({ orderBy: [{ familyKey: "asc" }, { stage: "asc" }] }),
    db.studentPet.findMany({
      where: { studentId: student.id },
      include: { species: { include: { nextEvolution: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.petDexEntry.findMany({ where: { studentId: student.id }, select: { speciesId: true } }),
    loadoutBuffPets(db, student.id),
    db.studentEgg.findFirst({ where: { studentId: student.id, status: "incubating" } }),
  ]);
  const effects = calculatePetEffects(loadout.pets);
  const ownedBySpecies = new Map(pets.map((pet) => [pet.speciesId, pet.id]));
  const discovered = new Set(dex.map((entry) => entry.speciesId));
  const eggProjection = egg ? projectIncubation({
    progressSeconds: egg.progressSeconds,
    lastProgressAt: egg.lastProgressAt,
    asOf: now,
    baseHatchSeconds: egg.baseHatchSeconds,
    hatchSpeedBps: effects.hatchSpeedBps,
  }) : null;

  return {
    student: { id: student.id, name: student.name },
    currency: { balance: account.balance, unitLabel: currency?.unitLabel ?? "원" },
    effects,
    loadoutPetIds: loadout.petIds,
    pets: pets.map((pet) => {
      const required = pet.species.nextEvolutionId ? evolutionXpRequired(pet.species.stage) : null;
      const cost = pet.enhancementLevel < 10 ? enhancementCost(pet.enhancementLevel) : null;
      return {
        id: pet.id,
        species: speciesPayload(pet.species),
        enhancementLevel: pet.enhancementLevel,
        evolutionXp: pet.evolutionXp,
        shards: pet.shards,
        effectiveBuffBps: effectivePetBuffBps(pet.species.baseEffectBps, pet.species.stage, pet.enhancementLevel),
        nextEvolution: pet.species.nextEvolution ? speciesPayload(pet.species.nextEvolution) : null,
        canEnhance: !!cost && pet.shards >= cost.shards && account.balance >= cost.currency,
        enhanceCost: cost,
        canEvolve: required !== null && pet.enhancementLevel === 10 && pet.evolutionXp >= required,
        evolutionXpRequired: required,
      };
    }),
    dex: species.map((item) => ({
      species: speciesPayload(item),
      discovered: discovered.has(item.id),
      ownedPetId: ownedBySpecies.get(item.id) ?? null,
    })),
    egg: egg && eggProjection ? {
      id: egg.id,
      eggType: egg.eggType,
      eggName: egg.eggName,
      baseHatchSeconds: egg.baseHatchSeconds,
      progressSeconds: eggProjection.progressSeconds,
      asOf: now.toISOString(),
      remainingSeconds: eggProjection.remainingSeconds,
      canHatch: eggProjection.canHatch,
    } : null,
    eggShop: PET_EGG_SHOP.map((item) => ({ ...item })),
  };
}

function chooseSpecies<T extends { stage: number; hatchWeight: number }>(rows: T[], eggType: string) {
  const evolvedMultiplier = eggType === "aurora" ? 4 : eggType === "starlight" ? 2 : 1;
  const weighted = rows.map((row) => ({ row, weight: row.hatchWeight * (row.stage > 0 ? evolvedMultiplier : 1) }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll < 0) return item.row;
  }
  return weighted.at(-1)!.row;
}

export async function buyEgg(student: StudentIdentity, eggType: string) {
  const shop = PET_EGG_SHOP.find((item) => item.eggType === eggType);
  if (!shop) throw new PetDomainError("invalid_egg_type", 400);
  await ensureDefaultPetSpecies();
  const { accountId } = await ensureAccountFor(student);
  const candidates = await db.petSpecies.findMany({ where: { hatchWeight: { gt: 0 } } });
  const result = chooseSpecies(candidates, eggType);
  await db.$transaction(async (tx) => {
    if (await tx.studentEgg.findFirst({ where: { studentId: student.id, status: "incubating" }, select: { id: true } })) {
      throw new PetDomainError("active_egg_exists", 409);
    }
    const charged = await tx.studentAccount.updateMany({
      where: { id: accountId, balance: { gte: shop.price } },
      data: { balance: { decrement: shop.price } },
    });
    if (!charged.count) throw new PetDomainError("insufficient_balance", 409);
    const account = await tx.studentAccount.findUniqueOrThrow({ where: { id: accountId }, select: { balance: true } });
    const egg = await tx.studentEgg.create({ data: {
      studentId: student.id,
      resultSpeciesId: result.id,
      eggType: shop.eggType,
      eggName: shop.name,
      baseHatchSeconds: shop.baseHatchSeconds,
    } });
    await tx.transaction.create({ data: {
      accountId, type: "withdraw", amount: shop.price, balanceAfter: account.balance,
      note: `${shop.name} 구매`, sourceType: "pet_egg_purchase",
      sourceRef: `${student.id}:${egg.id}`, performedById: student.id, performedByKind: "owner",
    } });
  });
  return getPetHome(student);
}

export async function hatchEgg(student: StudentIdentity, eggId: string) {
  const hatch = await db.$transaction(async (tx) => {
    const egg = await tx.studentEgg.findUnique({ where: { id: eggId }, include: { resultSpecies: true } });
    if (!egg) throw new PetDomainError("egg_not_found", 404);
    if (egg.studentId !== student.id) throw new PetDomainError("egg_forbidden", 403);
    if (egg.status !== "incubating") throw new PetDomainError("egg_already_hatched", 409);
    const settled = await settleActiveEgg(tx, student.id);
    if (!settled || settled.id !== egg.id || settled.progressSeconds < settled.baseHatchSeconds) {
      throw new PetDomainError("egg_not_ready", 409);
    }
    const claimed = await tx.studentEgg.updateMany({
      where: { id: egg.id, status: "incubating" },
      data: { status: "hatched", hatchedAt: new Date() },
    });
    if (!claimed.count) throw new PetDomainError("egg_already_hatched", 409);
    await tx.petDexEntry.upsert({
      where: { studentId_speciesId: { studentId: student.id, speciesId: egg.resultSpeciesId } },
      create: { studentId: student.id, speciesId: egg.resultSpeciesId }, update: {},
    });
    const existing = await tx.studentPet.findUnique({
      where: { studentId_speciesId: { studentId: student.id, speciesId: egg.resultSpeciesId } },
    });
    const duplicateShards = egg.resultSpecies.stage > 0 ? 10 : 5;
    const pet = existing
      ? await tx.studentPet.update({ where: { id: existing.id }, data: { shards: { increment: duplicateShards } } })
      : await tx.studentPet.create({ data: { studentId: student.id, speciesId: egg.resultSpeciesId } });
    return { petId: pet.id, species: speciesPayload(egg.resultSpecies), duplicate: !!existing, shardsAwarded: existing ? duplicateShards : 0 };
  });
  return { home: await getPetHome(student), hatch };
}

export async function replaceLoadout(student: StudentIdentity, petIds: string[]) {
  if (petIds.length > 5 || new Set(petIds).size !== petIds.length || petIds.some((id) => typeof id !== "string" || !id)) {
    throw new PetDomainError("invalid_pet_ids", 400);
  }
  await db.$transaction(async (tx) => {
    await settleActiveEgg(tx, student.id);
    const owned = await tx.studentPet.count({ where: { studentId: student.id, id: { in: petIds } } });
    if (owned !== petIds.length) throw new PetDomainError("pet_forbidden", 403);
    const loadout = await tx.petSynergyLoadout.upsert({
      where: { studentId: student.id }, create: { studentId: student.id }, update: {},
    });
    await tx.petSynergySlot.deleteMany({ where: { loadoutId: loadout.id } });
    if (petIds.length) await tx.petSynergySlot.createMany({
      data: petIds.map((petId, slotIndex) => ({ loadoutId: loadout.id, petId, slotIndex })),
    });
  });
  return getPetHome(student);
}

export async function enhancePet(student: StudentIdentity, petId: string) {
  const { accountId } = await ensureAccountFor(student);
  await db.$transaction(async (tx) => {
    const pet = await tx.studentPet.findUnique({ where: { id: petId } });
    if (!pet) throw new PetDomainError("pet_not_found", 404);
    if (pet.studentId !== student.id) throw new PetDomainError("pet_forbidden", 403);
    if (pet.enhancementLevel >= 10) throw new PetDomainError("enhancement_max", 409);
    const cost = enhancementCost(pet.enhancementLevel);
    if (pet.shards < cost.shards) throw new PetDomainError("insufficient_shards", 409);
    await settleActiveEgg(tx, student.id);
    const charged = await tx.studentAccount.updateMany({ where: { id: accountId, balance: { gte: cost.currency } }, data: { balance: { decrement: cost.currency } } });
    if (!charged.count) throw new PetDomainError("insufficient_balance", 409);
    const updated = await tx.studentPet.updateMany({
      where: { id: pet.id, studentId: student.id, enhancementLevel: pet.enhancementLevel, shards: { gte: cost.shards } },
      data: { enhancementLevel: { increment: 1 }, shards: { decrement: cost.shards } },
    });
    if (!updated.count) throw new PetDomainError("pet_changed", 409);
    const account = await tx.studentAccount.findUniqueOrThrow({ where: { id: accountId }, select: { balance: true } });
    await tx.transaction.create({ data: {
      accountId, type: "withdraw", amount: cost.currency, balanceAfter: account.balance,
      note: "펫 강화", sourceType: "pet_enhance",
      sourceRef: `${student.id}:${pet.id}:${pet.speciesId}:${pet.enhancementLevel + 1}`,
      performedById: student.id, performedByKind: "owner",
    } });
  });
  return getPetHome(student);
}

export async function evolvePet(student: StudentIdentity, petId: string) {
  await db.$transaction(async (tx) => {
    const pet = await tx.studentPet.findUnique({ where: { id: petId }, include: { species: true } });
    if (!pet) throw new PetDomainError("pet_not_found", 404);
    if (pet.studentId !== student.id) throw new PetDomainError("pet_forbidden", 403);
    if (!pet.species.nextEvolutionId) throw new PetDomainError("no_next_evolution", 409);
    const required = evolutionXpRequired(pet.species.stage);
    if (pet.enhancementLevel !== 10 || pet.evolutionXp < required) throw new PetDomainError("evolution_requirements_not_met", 409);
    await settleActiveEgg(tx, student.id);
    const target = await tx.studentPet.findUnique({ where: { studentId_speciesId: { studentId: student.id, speciesId: pet.species.nextEvolutionId } } });
    await tx.petDexEntry.upsert({
      where: { studentId_speciesId: { studentId: student.id, speciesId: pet.species.nextEvolutionId } },
      create: { studentId: student.id, speciesId: pet.species.nextEvolutionId }, update: {},
    });
    if (!target) {
      await tx.studentPet.update({ where: { id: pet.id }, data: {
        speciesId: pet.species.nextEvolutionId,
        enhancementLevel: 3,
        evolutionXp: pet.evolutionXp - required,
      } });
      return;
    }
    const sourceSlot = await tx.petSynergySlot.findFirst({ where: { petId: pet.id } });
    const targetSlot = await tx.petSynergySlot.findFirst({ where: { petId: target.id } });
    if (sourceSlot && targetSlot && sourceSlot.loadoutId === targetSlot.loadoutId) {
      await tx.petSynergySlot.delete({ where: { id: sourceSlot.id } });
    } else if (sourceSlot) {
      await tx.petSynergySlot.update({ where: { id: sourceSlot.id }, data: { petId: target.id } });
    }
    if (target.enhancementLevel < 3) {
      await tx.studentPet.updateMany({
        where: { id: target.id, enhancementLevel: { lt: 3 } },
        data: { enhancementLevel: 3 },
      });
    }
    await tx.studentPet.update({
      where: { id: target.id },
      data: {
        shards: { increment: pet.shards },
        evolutionXp: { increment: Math.max(0, pet.evolutionXp - required) },
      },
    });
    await tx.studentPet.delete({ where: { id: pet.id } });
  });
  return getPetHome(student);
}

export async function awardActivePetEvolutionXp(input: {
  studentId: string; sourceType: string; sourceRef: string; baseXp: number;
}) {
  if (input.baseXp <= 0) return 0;
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.petActivityGrant.findUnique({
        where: { studentId_sourceType_sourceRef: {
          studentId: input.studentId, sourceType: input.sourceType, sourceRef: input.sourceRef,
        } },
      });
      if (existing) return existing.awardedXp;
      const effects = await getStudentPetEffects(tx, input.studentId);
      const awardedXp = Math.max(1, Math.round(input.baseXp * (1 + effects.evolutionXpBps / 10_000)));
      if (effects.petIds.length) await tx.studentPet.updateMany({
        where: { studentId: input.studentId, id: { in: effects.petIds } },
        data: { evolutionXp: { increment: awardedXp } },
      });
      await tx.petActivityGrant.create({ data: { ...input, awardedXp } });
      return awardedXp;
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const existing = await db.petActivityGrant.findUnique({
      where: { studentId_sourceType_sourceRef: {
        studentId: input.studentId,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
      } },
      select: { awardedXp: true },
    });
    if (!existing) throw error;
    return existing.awardedXp;
  }
}

export function petErrorResponse(error: unknown) {
  if (error instanceof PetDomainError) return { body: { error: error.code }, status: error.status };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { body: { error: "pet_conflict" }, status: 409 };
  }
  return null;
}
