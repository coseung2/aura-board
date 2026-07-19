export type PetEffectKey =
  | "hatch_speed"
  | "evolution_xp"
  | "reading_currency"
  | "walking_currency";

export type PetSpeciesPayload = {
  id: string;
  key: string;
  name: string;
  type: string;
  rarity: string;
  stage: number;
  familyKey: string;
  effectKey: PetEffectKey;
  spriteKey: string;
  nextEvolutionId: string | null;
};

export type PetEffectsPayload = {
  hatchSpeedBps: number;
  evolutionXpBps: number;
  readingRewardBps: number;
  walkingRewardBps: number;
  breakdown: Array<{
    label: string;
    effectKey: PetEffectKey;
    bps: number;
  }>;
};

export type PetHomePayload = {
  student: { id: string; name: string };
  currency: { balance: number; unitLabel: string };
  effects: PetEffectsPayload;
  loadoutPetIds: string[];
  pets: Array<{
    id: string;
    species: PetSpeciesPayload;
    enhancementLevel: number;
    evolutionXp: number;
    shards: number;
    effectiveBuffBps: number;
    nextEvolution: PetSpeciesPayload | null;
    canEnhance: boolean;
    enhanceCost: { currency: number; shards: number } | null;
    canEvolve: boolean;
    evolutionXpRequired: number | null;
  }>;
  dex: Array<{
    species: PetSpeciesPayload;
    discovered: boolean;
    ownedPetId: string | null;
  }>;
  egg: {
    id: string;
    eggType: string;
    eggName: string;
    baseHatchSeconds: number;
    progressSeconds: number;
    asOf: string;
    remainingSeconds: number;
    canHatch: boolean;
  } | null;
  eggShop: Array<{
    eggType: string;
    name: string;
    price: number;
    baseHatchSeconds: number;
  }>;
};

