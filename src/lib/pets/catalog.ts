import type {
  SlimeAccessoryDefinition,
  SlimeColor,
  SlimeDefinition,
  SlimeShopItem,
  SlimeSetDefinition,
} from "./types";

const SLIME_ASSET_ROOT = "/creatures/slimes";
export const SLIME_DEFAULT_PRICE = 100;
export const SLIME_DEFAULT_BUFF_BPS = 200;
export const SLIME_SHOP_DEFAULT_PRICE = 30;

/** The five generated colour variants used by the web preview. */
export const SLIME_CATALOG: readonly SlimeDefinition[] = [
  {
    key: "blue",
    color: "blue",
    nameKo: "블루 슬라임",
    effectKey: "growth_speed",
    baseBuffBps: SLIME_DEFAULT_BUFF_BPS,
    price: SLIME_DEFAULT_PRICE,
    spritePath: `${SLIME_ASSET_ROOT}/blue/idle.gif`,
  },
  {
    key: "green",
    color: "green",
    nameKo: "그린 슬라임",
    effectKey: "reading_reward",
    baseBuffBps: SLIME_DEFAULT_BUFF_BPS,
    price: SLIME_DEFAULT_PRICE,
    spritePath: `${SLIME_ASSET_ROOT}/green/idle.gif`,
  },
  {
    key: "yellow",
    color: "yellow",
    nameKo: "옐로 슬라임",
    effectKey: "walking_reward",
    baseBuffBps: SLIME_DEFAULT_BUFF_BPS,
    price: SLIME_DEFAULT_PRICE,
    spritePath: `${SLIME_ASSET_ROOT}/yellow/idle.gif`,
  },
  {
    key: "purple",
    color: "purple",
    nameKo: "퍼플 슬라임",
    effectKey: "assignment_reward",
    baseBuffBps: SLIME_DEFAULT_BUFF_BPS,
    price: SLIME_DEFAULT_PRICE,
    spritePath: `${SLIME_ASSET_ROOT}/purple/idle.gif`,
  },
  {
    key: "red",
    color: "red",
    nameKo: "레드 슬라임",
    effectKey: "comment_reward",
    baseBuffBps: SLIME_DEFAULT_BUFF_BPS,
    price: SLIME_DEFAULT_PRICE,
    spritePath: `${SLIME_ASSET_ROOT}/red/idle.gif`,
  },
] as const;

/** Student-owned slime home items sold through the shared won wallet. */
export const SLIME_SHOP_CATALOG: readonly SlimeShopItem[] = [
  {
    key: "water-puddle-background",
    category: "background",
    labelKo: "물웅덩이 배경",
    price: SLIME_SHOP_DEFAULT_PRICE,
    spritePath: `${SLIME_ASSET_ROOT}/shop/water-puddle.gif`,
  },
  {
    key: "slime-blue-trampoline",
    category: "ride",
    labelKo: "트램펄린",
    price: SLIME_SHOP_DEFAULT_PRICE,
    spritePath: `${SLIME_ASSET_ROOT}/shop/slime-blue-trampoline.gif`,
  },
  {
    key: "slime-blue-drink-lemonade",
    category: "drink",
    labelKo: "레모네이드",
    price: SLIME_SHOP_DEFAULT_PRICE,
    spritePath: `${SLIME_ASSET_ROOT}/shop/slime-blue-drink-lemonade.gif`,
  },
] as const;

/** Accessory previews are intentionally local-only until a persistence API exists. */
export const SLIME_ACCESSORY_CATALOG: readonly SlimeAccessoryDefinition[] = [
  { key: "aqua-ribbon", labelKo: "물방울 리본", setKey: "aqua", slot: "neck" },
  { key: "aqua-crown", labelKo: "파도 왕관", setKey: "aqua", slot: "head" },
  { key: "aqua-shell", labelKo: "조개 장식", setKey: "aqua", slot: "hand" },
  { key: "garden-leaf", labelKo: "새싹 잎사귀", setKey: "garden", slot: "head" },
  { key: "garden-vine", labelKo: "덩굴 팔찌", setKey: "garden", slot: "hand" },
  { key: "sunny-badge", labelKo: "햇살 배지", setKey: "sunny", slot: "neck" },
  { key: "sunny-cap", labelKo: "노랑 모자", setKey: "sunny", slot: "head" },
  { key: "starlit-brooch", labelKo: "별빛 브로치", setKey: "starlit", slot: "neck" },
  { key: "starlit-wand", labelKo: "별빛 스틱", setKey: "starlit", slot: "hand" },
] as const;

export const SLIME_SET_CATALOG: readonly SlimeSetDefinition[] = [
  {
    key: "aqua",
    labelKo: "아쿠아 세트",
    requiredAccessoryKeys: ["aqua-ribbon", "aqua-crown", "aqua-shell"],
    effectKey: "growth_speed",
    effectBps: 180,
  },
  {
    key: "garden",
    labelKo: "가든 세트",
    requiredAccessoryKeys: ["garden-leaf", "garden-vine"],
    effectKey: "reading_reward",
    effectBps: 160,
  },
  {
    key: "sunny",
    labelKo: "써니 세트",
    requiredAccessoryKeys: ["sunny-badge", "sunny-cap"],
    effectKey: "walking_reward",
    effectBps: 140,
  },
  {
    key: "starlit",
    labelKo: "스타라이트 세트",
    requiredAccessoryKeys: ["starlit-brooch", "starlit-wand"],
    effectKey: "assignment_reward",
    effectBps: 120,
  },
] as const;

const slimeByKey = new Map<SlimeColor, SlimeDefinition>(
  SLIME_CATALOG.map((slime) => [slime.key, slime]),
);
const accessoryByKey = new Map<string, SlimeAccessoryDefinition>(
  SLIME_ACCESSORY_CATALOG.map((accessory) => [accessory.key, accessory]),
);
const slimeShopItemByKey = new Map<string, SlimeShopItem>(
  SLIME_SHOP_CATALOG.map((item) => [item.key, item]),
);

export function getSlimeDefinition(key: string): SlimeDefinition | undefined {
  return slimeByKey.get(key as SlimeColor);
}

export function getSlimeAccessoryDefinition(
  key: string,
): SlimeAccessoryDefinition | undefined {
  return accessoryByKey.get(key);
}

export function getSlimeShopItem(key: string): SlimeShopItem | undefined {
  return slimeShopItemByKey.get(key);
}
