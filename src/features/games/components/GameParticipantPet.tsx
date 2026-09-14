"use client";

import { memo } from "react";
import { UserRound } from "lucide-react";
import { getSlimeDefinition, getSlimeShopItem } from "@/lib/pets/catalog";
import { characterOnlySlimeItemKeys } from "@/lib/pets/character-only-items";
import { visibleEquippedSlimeItemKeys } from "@/lib/pets/item-visibility";
import type { SlimeShopItem } from "@/lib/pets/types";
import { SlimeCharacterSprite } from "@/components/creatures/SlimeCharacterSprite";

export type GameParticipantPetData = {
  color: string;
  growthStage: 1 | 2 | 3;
  equippedItemKeys: string[];
  hiddenItemKeys: string[];
};

/**
 * Waiting-room avatar for a student's representative pet.
 *
 * Shows the character the student actually equipped, minus scene furniture:
 * backgrounds, floors and vehicles are dropped so a roster row stays aligned
 * and a 44px avatar is not swallowed by a full scene.
 */
export const GameParticipantPet = memo(function GameParticipantPet({
  name,
  pet,
}: {
  name: string;
  pet: GameParticipantPetData | null | undefined;
}) {
  const slime = pet?.color ? getSlimeDefinition(pet.color) : undefined;
  const items = pet
    ? characterOnlySlimeItemKeys(
        visibleEquippedSlimeItemKeys(pet.equippedItemKeys, pet.hiddenItemKeys),
      )
        .map((key) => getSlimeShopItem(key))
        .filter((item): item is SlimeShopItem => Boolean(item))
    : [];

  return (
    <span
      className="game-participant-pet"
      role="img"
      aria-label={`${name} ${slime ? "대표펫" : "대표펫 미지정"}`}
    >
      <span aria-hidden="true">
        {slime ? (
          <SlimeCharacterSprite
            slime={slime}
            items={items}
            growthStage={pet?.growthStage}
            scale={1}
            hostBackground={false}
          />
        ) : (
          <UserRound size={22} />
        )}
      </span>
    </span>
  );
});
