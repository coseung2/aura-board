"use client";

import type { SlimeAction, SlimeColor, SlimeEvolution, EquippedFloor } from "@/lib/pets/slime-assets";
import type { SlimeDefinition, SlimeShopItem } from "@/lib/pets/types";

import { OfficialSlimeSprite } from "./OfficialSlimeSprite";
import styles from "./SlimeCharacterSprite.module.css";
import { slimeItemSpritePath } from "./SlimePetModel";

export type SlimeGrowthStage = 1 | 2 | 3;

type Props = {
  slime: SlimeDefinition;
  items?: SlimeShopItem[];
  /** Persisted server stage; callers may use stage one while loading. */
  growthStage?: SlimeGrowthStage;
  /** A transient action controlled by the owning card. */
  action?: SlimeAction;
  /** Optional server-restored semantic floor. Legacy callers can omit it. */
  equippedFloor?: EquippedFloor;
  onComplete?: () => void;
  repeat?: boolean;
  className?: string;
};

const EVOLUTION_BY_STAGE: Record<SlimeGrowthStage, SlimeEvolution> = {
  1: "base",
  2: "gold-crown-red-gem",
  3: "silver-crown-blue-gem",
};

function floorFromItems(items: readonly SlimeShopItem[]): EquippedFloor {
  let floor: EquippedFloor = "none";
  for (const item of items) {
    const candidate = item.floor;
    if (
      candidate === "grass-floor" ||
      candidate === "water-puddle" ||
      candidate === "trampoline"
    ) {
      floor = candidate;
    }
  }
  return floor;
}

function evolutionForStage(stage: number): SlimeEvolution {
  if (stage >= 3) return EVOLUTION_BY_STAGE[3];
  if (stage >= 2) return EVOLUTION_BY_STAGE[2];
  return EVOLUTION_BY_STAGE[1];
}

export function SlimeCharacterSprite({
  slime,
  items = [],
  growthStage = 1,
  action = "idle",
  equippedFloor,
  onComplete,
  repeat = false,
  className = "",
}: Props) {
  const floor = equippedFloor ?? floorFromItems(items);
  const evolution = evolutionForStage(growthStage);
  // Only unsupported legacy props may fall back to a complete character GIF.
  // Drinks and floors have canonical color/evolution-specific official sheets.
  // Ball props are complete, color-specific looping GIFs rather than an
  // overlay sheet. Resolve them from the equipped slime color before falling
  // back to legacy prop paths.
  const ballItem = items.find((item) => item.key.startsWith("slime-ball-"));
  const itemSpritePath = ballItem
    ? slimeItemSpritePath(ballItem, slime.color as SlimeColor)
    : items.find(
        (item) => !item.floor && item.category !== "background" && item.category !== "drink",
      )?.spritePath;
  const itemLabels = items.map((item) => item.labelKo).join(", ");
  const alt = items.length > 0
    ? `${slime.nameKo}, ${itemLabels} 적용 미리보기`
    : `${slime.nameKo} 미리보기`;

  return (
    <div className={`${styles.frame} ${className}`.trim()}>
      <OfficialSlimeSprite
        slimeColor={slime.color as SlimeColor}
        evolution={evolution}
        action={action}
        equippedFloor={floor}
        itemSpritePath={itemSpritePath}
        repeat={repeat || Boolean(ballItem)}
        alt={alt}
        dataSlimeColor={slime.color as SlimeColor}
        onComplete={onComplete}
      />
    </div>
  );
}
