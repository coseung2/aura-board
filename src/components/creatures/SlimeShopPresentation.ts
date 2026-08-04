import { formatBpsPercent } from "@/lib/pets/math";
import type {
  SlimeAction,
  EquippedFloor,
} from "@/lib/pets/slime-assets";
import type { SlimeColor, SlimeShopItem } from "@/lib/pets/types";

import {
  EFFECT_LABELS,
  type EquippedItemsByColor,
} from "./SlimePetModel";

const EFFECT_CHIP_LABELS: Record<keyof typeof EFFECT_LABELS, string> = {
  growth_speed: "성장",
  reading_reward: "독서",
  walking_reward: "걷기",
  assignment_reward: "과제",
  comment_reward: "댓글",
};

const SLIME_COLOR_SHORT_LABELS: Record<SlimeColor, string> = {
  blue: "블루",
  green: "그린",
  yellow: "옐로",
  purple: "퍼플",
  red: "레드",
};

const SLIME_TRAMPOLINE_ITEM_KEY = "slime-blue-trampoline";

export function slimeShopItemBuffLabel(
  item: Pick<SlimeShopItem, "effectKey" | "effectBps">,
): string | null {
  if (!item.effectKey || !item.effectBps) return null;
  const label =
    EFFECT_CHIP_LABELS[item.effectKey] ??
    EFFECT_LABELS[item.effectKey] ??
    item.effectKey;
  return `${label} +${formatBpsPercent(item.effectBps)}`;
}

export function slimeBuffChipTier(
  bps: number,
): "bronze" | "silver" | "gold" {
  if (bps > 200) return "gold";
  if (bps > 100) return "silver";
  return "bronze";
}

export function slimeShopPreviewState(
  item: Pick<SlimeShopItem, "key" | "category" | "floor">,
): {
  action: SlimeAction;
  equippedFloor: EquippedFloor;
} {
  const usesTrampoline = item.key === SLIME_TRAMPOLINE_ITEM_KEY;
  return {
    action: usesTrampoline
      ? "floor-interaction"
      : item.category === "drink"
        ? "drink"
        : "idle",
    equippedFloor: usesTrampoline ? "trampoline" : item.floor ?? "none",
  };
}

export function slimeWardrobeItemWearerLabel(
  itemKey: string,
  wardrobeColor: SlimeColor | null,
  equippedItemsByColor: EquippedItemsByColor,
): string | null {
  if (!wardrobeColor) return null;
  for (const [color, itemKeys] of Object.entries(equippedItemsByColor)) {
    if (color === wardrobeColor) continue;
    if (!itemKeys?.includes(itemKey)) continue;
    return SLIME_COLOR_SHORT_LABELS[color as SlimeColor] ?? color;
  }
  return null;
}
