import type { PetLineageDefinition } from "@/lib/pets/catalog";

export type Pet = {
  id: string;
  lineageId: string;
  stage: number;
  nickname: string | null;
  hatchProgress: number;
  hatchRequired: number;
  experience: number;
  equipped: boolean;
  backgroundKey: string | null;
  acquiredVia: string;
  acquiredAt: string;
  hatchedAt: string | null;
  evolvedAt: string | null;
  canEvolve: boolean;
  nextEvolutionXp: number | null;
};

export type PetHome = {
  student: { id: string; name: string; number: number | null; classroomId: string };
  balance: number;
  currency: { unitLabel: string };
  pets: Pet[];
  inventory: Record<string, number>;
  dex: Array<{ lineageId: string; eggOwned: boolean; discoveredStages: number[] }>;
};

export type PetTab = "front" | "collection" | "shop" | "fitting" | "dex";
export type PetShopFilter = "all" | "egg" | "care" | "background";
export type PetActionPayload =
  | { action: "feed"; petId: string; itemKey: string }
  | { action: "accelerate"; petId: string; itemKey: string }
  | { action: "evolve"; petId: string }
  | { action: "equip"; petId: string }
  | { action: "set-background"; petId: string; itemKey: string | null }
  | { action: "rename"; petId: string; nickname: string | null };

export const petDisplayName = (pet: Pet, lineage: PetLineageDefinition): string => {
  if (pet.nickname) return pet.nickname;
  if (pet.stage === 0) return lineage.egg.name;
  return lineage.stages[pet.stage - 1]?.name ?? lineage.stages[0].name;
};
