import type { PetEffectKey, PetEffectsPayload } from "./types";

export type BuffPet = {
  type: string;
  effectKey: PetEffectKey;
  label: string;
  baseEffectBps: number;
  stage: number;
  enhancementLevel: number;
};

const TYPE_PRIMARY_EFFECT: Record<string, PetEffectKey> = {
  flame: "hatch_speed",
  nature: "evolution_xp",
  wisdom: "reading_currency",
  energy: "walking_currency",
};

const TYPE_LABEL: Record<string, string> = {
  flame: "불꽃",
  nature: "자연",
  wisdom: "지혜",
  energy: "활력",
};

export function effectivePetBuffBps(
  baseEffectBps: number,
  stage: number,
  enhancementLevel: number,
) {
  return Math.round(
    baseEffectBps * (1 + stage * 0.6 + enhancementLevel * 0.08),
  );
}

export function synergyTierBps(count: number) {
  if (count >= 5) return 800;
  if (count >= 3) return 400;
  if (count >= 2) return 200;
  return 0;
}

export function calculatePetEffects(pets: BuffPet[]): PetEffectsPayload {
  const totals: Record<PetEffectKey, number> = {
    hatch_speed: 0,
    evolution_xp: 0,
    reading_currency: 0,
    walking_currency: 0,
  };
  const breakdown: PetEffectsPayload["breakdown"] = [];

  for (const pet of pets) {
    const bps = effectivePetBuffBps(
      pet.baseEffectBps,
      pet.stage,
      pet.enhancementLevel,
    );
    totals[pet.effectKey] += bps;
    breakdown.push({ label: pet.label, effectKey: pet.effectKey, bps });
  }

  const typeCounts = new Map<string, number>();
  for (const pet of pets) typeCounts.set(pet.type, (typeCounts.get(pet.type) ?? 0) + 1);
  for (const [type, count] of typeCounts) {
    const effectKey = TYPE_PRIMARY_EFFECT[type];
    const bps = synergyTierBps(count);
    if (!effectKey || bps === 0) continue;
    totals[effectKey] += bps;
    breakdown.push({ label: `${TYPE_LABEL[type] ?? type} 타입 시너지`, effectKey, bps });
  }

  return {
    hatchSpeedBps: totals.hatch_speed,
    evolutionXpBps: totals.evolution_xp,
    readingRewardBps: totals.reading_currency,
    walkingRewardBps: totals.walking_currency,
    breakdown,
  };
}

export function projectIncubation(input: {
  progressSeconds: number;
  lastProgressAt: Date;
  asOf: Date;
  baseHatchSeconds: number;
  hatchSpeedBps: number;
}) {
  const elapsedSeconds = Math.max(
    0,
    (input.asOf.getTime() - input.lastProgressAt.getTime()) / 1000,
  );
  const speed = 1 + input.hatchSpeedBps / 10_000;
  const progressSeconds = Math.min(
    input.baseHatchSeconds,
    Math.max(0, input.progressSeconds) + elapsedSeconds * speed,
  );
  const remainingSeconds = Math.max(
    0,
    (input.baseHatchSeconds - progressSeconds) / speed,
  );
  return {
    progressSeconds,
    remainingSeconds,
    canHatch: progressSeconds >= input.baseHatchSeconds,
  };
}
