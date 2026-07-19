import "server-only";
import { db } from "@/lib/db";
import type { PetEffectKey } from "./types";

type CatalogSpecies = {
  key: string;
  name: string;
  type: string;
  rarity: string;
  stage: number;
  familyKey: string;
  effectKey: PetEffectKey;
  baseEffectBps: number;
  spriteKey: string;
  hatchWeight: number;
  nextKey?: string;
};

export const DEFAULT_PET_SPECIES: CatalogSpecies[] = [
  { key: "ember_fox", name: "불씨여우", type: "flame", rarity: "common", stage: 0, familyKey: "fox", effectKey: "hatch_speed", baseEffectBps: 300, spriteKey: "ember_fox", hatchWeight: 100, nextKey: "solar_fox" },
  { key: "solar_fox", name: "태양여우", type: "flame", rarity: "rare", stage: 1, familyKey: "fox", effectKey: "hatch_speed", baseEffectBps: 300, spriteKey: "solar_fox", hatchWeight: 4 },
  { key: "spark_dragon", name: "불꽃용", type: "flame", rarity: "common", stage: 0, familyKey: "dragon", effectKey: "hatch_speed", baseEffectBps: 320, spriteKey: "spark_dragon", hatchWeight: 100, nextKey: "blaze_dragon" },
  { key: "blaze_dragon", name: "화염용", type: "flame", rarity: "rare", stage: 1, familyKey: "dragon", effectKey: "hatch_speed", baseEffectBps: 320, spriteKey: "blaze_dragon", hatchWeight: 4 },
  { key: "moss_turtle", name: "이끼거북", type: "nature", rarity: "common", stage: 0, familyKey: "turtle", effectKey: "evolution_xp", baseEffectBps: 300, spriteKey: "moss_turtle", hatchWeight: 100, nextKey: "grove_turtle" },
  { key: "grove_turtle", name: "숲등거북", type: "nature", rarity: "rare", stage: 1, familyKey: "turtle", effectKey: "evolution_xp", baseEffectBps: 300, spriteKey: "grove_turtle", hatchWeight: 4 },
  { key: "leaf_bear", name: "새싹곰", type: "nature", rarity: "common", stage: 0, familyKey: "bear", effectKey: "evolution_xp", baseEffectBps: 320, spriteKey: "leaf_bear", hatchWeight: 100, nextKey: "forest_bear" },
  { key: "forest_bear", name: "수호곰", type: "nature", rarity: "rare", stage: 1, familyKey: "bear", effectKey: "evolution_xp", baseEffectBps: 320, spriteKey: "forest_bear", hatchWeight: 4 },
  { key: "page_owl", name: "책부엉이", type: "wisdom", rarity: "common", stage: 0, familyKey: "owl", effectKey: "reading_currency", baseEffectBps: 300, spriteKey: "page_owl", hatchWeight: 100, nextKey: "sage_owl" },
  { key: "sage_owl", name: "현자부엉이", type: "wisdom", rarity: "rare", stage: 1, familyKey: "owl", effectKey: "reading_currency", baseEffectBps: 300, spriteKey: "sage_owl", hatchWeight: 4 },
  { key: "ink_cat", name: "먹물고양이", type: "wisdom", rarity: "common", stage: 0, familyKey: "cat", effectKey: "reading_currency", baseEffectBps: 320, spriteKey: "ink_cat", hatchWeight: 100, nextKey: "quill_cat" },
  { key: "quill_cat", name: "깃펜고양이", type: "wisdom", rarity: "rare", stage: 1, familyKey: "cat", effectKey: "reading_currency", baseEffectBps: 320, spriteKey: "quill_cat", hatchWeight: 4 },
  { key: "dash_rabbit", name: "뜀토끼", type: "energy", rarity: "common", stage: 0, familyKey: "rabbit", effectKey: "walking_currency", baseEffectBps: 300, spriteKey: "dash_rabbit", hatchWeight: 100, nextKey: "comet_rabbit" },
  { key: "comet_rabbit", name: "별빛토끼", type: "energy", rarity: "rare", stage: 1, familyKey: "rabbit", effectKey: "walking_currency", baseEffectBps: 300, spriteKey: "comet_rabbit", hatchWeight: 4 },
  { key: "brook_otter", name: "시냇수달", type: "energy", rarity: "common", stage: 0, familyKey: "otter", effectKey: "walking_currency", baseEffectBps: 320, spriteKey: "brook_otter", hatchWeight: 100, nextKey: "rapid_otter" },
  { key: "rapid_otter", name: "번개수달", type: "energy", rarity: "rare", stage: 1, familyKey: "otter", effectKey: "walking_currency", baseEffectBps: 320, spriteKey: "rapid_otter", hatchWeight: 4 },
];

export const PET_EGG_SHOP = [
  { eggType: "meadow", name: "초원의 알", price: 300, baseHatchSeconds: 36_000 },
  { eggType: "starlight", name: "별빛 알", price: 700, baseHatchSeconds: 28_800 },
  { eggType: "aurora", name: "오로라 알", price: 1_200, baseHatchSeconds: 21_600 },
] as const;

export async function ensureDefaultPetSpecies() {
  await db.$transaction(async (tx) => {
    for (const species of DEFAULT_PET_SPECIES) {
      const { nextKey: _nextKey, ...data } = species;
      await tx.petSpecies.upsert({
        where: { key: species.key },
        create: data,
        update: data,
      });
    }
    for (const species of DEFAULT_PET_SPECIES) {
      if (!species.nextKey) continue;
      const next = await tx.petSpecies.findUniqueOrThrow({
        where: { key: species.nextKey },
        select: { id: true },
      });
      await tx.petSpecies.update({
        where: { key: species.key },
        data: { nextEvolutionId: next.id },
      });
    }
  });
}
