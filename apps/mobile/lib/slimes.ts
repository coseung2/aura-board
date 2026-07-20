import {
  EQUIPPED_FLOORS,
  SLIME_ASSET_COLORS,
  type EquippedFloor,
  type SlimeColor,
  type SlimeEvolution,
} from "./slime-assets";

export const SLIME_COLOR_LABELS: Record<SlimeColor, string> = {
  blue: "블루",
  green: "그린",
  yellow: "옐로",
  purple: "퍼플",
  red: "레드",
};

export const SLIME_COLOR_SWATCHES: Record<SlimeColor, string> = {
  blue: "#44a9dc",
  green: "#49b877",
  yellow: "#f4c94e",
  purple: "#9d7bce",
  red: "#e46a62",
};

export const SLIME_STAGE_LABELS: Record<1 | 2 | 3, string> = {
  1: "기본",
  2: "금 왕관 · 빨강 보석",
  3: "은 왕관 · 파랑 보석",
};

export type SlimeGrowth = {
  stage: 1 | 2 | 3;
  growthSeconds: number;
  remainingSeconds: number;
  remainingMinutes: number;
};

export type SlimeCatalogItem = {
  key: SlimeColor;
  color: SlimeColor;
  nameKo: string;
  effectKey: string;
  price: number;
};

export type SlimeShopItem = {
  key: string;
  category: "background" | "ride" | "drink";
  floor: Exclude<EquippedFloor, "none"> | null;
  labelKo: string;
  price: number;
};

export type MobileSlimeHome = {
  balance: number;
  unitLabel: string;
  ownedColors: SlimeColor[];
  equippedColors: SlimeColor[];
  representativeColor: SlimeColor | null;
  catalog: SlimeCatalogItem[];
  ownedItemKeys: string[];
  equippedItemKeys: string[];
  equippedItemsByColor: Partial<Record<SlimeColor, string[]>>;
  equippedFloorByColor: Partial<Record<SlimeColor, EquippedFloor>>;
  equippedFloor: EquippedFloor;
  shopCatalog: SlimeShopItem[];
  growthByColor: Partial<Record<SlimeColor, SlimeGrowth>>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

function color(value: unknown): SlimeColor | null {
  return typeof value === "string" && (SLIME_ASSET_COLORS as readonly string[]).includes(value)
    ? (value as SlimeColor)
    : null;
}

function floor(value: unknown): EquippedFloor {
  return typeof value === "string" && (EQUIPPED_FLOORS as readonly string[]).includes(value)
    ? (value as EquippedFloor)
    : "none";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function colorsList(value: unknown): SlimeColor[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(color)
    .filter((item): item is SlimeColor => item !== null);
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stageValue(value: unknown): 1 | 2 | 3 {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  if (value >= 3) return 3;
  if (value >= 2) return 2;
  return 1;
}

function normalizeGrowth(value: unknown): SlimeGrowth {
  const item = isRecord(value) ? value : {};
  return {
    stage: stageValue(item.stage),
    growthSeconds: Math.max(0, Math.trunc(numberValue(item.growthSeconds))),
    remainingSeconds: Math.max(0, Math.trunc(numberValue(item.remainingSeconds))),
    remainingMinutes: Math.max(0, Math.trunc(numberValue(item.remainingMinutes))),
  };
}

function normalizeCatalog(value: unknown): SlimeCatalogItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const itemColor = color(entry.color ?? entry.key);
    if (!itemColor) return [];
    return [
      {
        key: itemColor,
        color: itemColor,
        nameKo:
          typeof entry.nameKo === "string"
            ? entry.nameKo
            : `${SLIME_COLOR_LABELS[itemColor]} 슬라임`,
        effectKey: typeof entry.effectKey === "string" ? entry.effectKey : "",
        price: Math.max(0, Math.trunc(numberValue(entry.price))),
      },
    ];
  });
}

function normalizeShopCatalog(value: unknown): SlimeShopItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.key !== "string") return [];
    const category = entry.category;
    if (category !== "background" && category !== "ride" && category !== "drink") {
      return [];
    }
    const parsedFloor = entry.floor === null ? "none" : floor(entry.floor);
    const itemFloor = parsedFloor === "none" ? null : parsedFloor;
    return [
      {
        key: entry.key,
        category,
        floor: itemFloor,
        labelKo: typeof entry.labelKo === "string" ? entry.labelKo : entry.key,
        price: Math.max(0, Math.trunc(numberValue(entry.price))),
      },
    ];
  });
}

function normalizeItemsByColor(
  value: unknown,
): Partial<Record<SlimeColor, string[]>> {
  if (!isRecord(value)) return {};
  const result: Partial<Record<SlimeColor, string[]>> = {};
  for (const itemColor of SLIME_ASSET_COLORS) {
    result[itemColor] = stringList(value[itemColor]);
  }
  return result;
}

function normalizeFloorsByColor(
  value: unknown,
): Partial<Record<SlimeColor, EquippedFloor>> {
  if (!isRecord(value)) return {};
  const result: Partial<Record<SlimeColor, EquippedFloor>> = {};
  for (const itemColor of SLIME_ASSET_COLORS) {
    if (value[itemColor] !== undefined) result[itemColor] = floor(value[itemColor]);
  }
  return result;
}

export function normalizeSlimeHome(payload: unknown): MobileSlimeHome {
  const value = isRecord(payload) ? payload : {};
  const growthSource = isRecord(value.growthByColor)
    ? value.growthByColor
    : isRecord(value.growth)
      ? value.growth
      : {};
  const growthByColor: Partial<Record<SlimeColor, SlimeGrowth>> = {};
  for (const itemColor of SLIME_ASSET_COLORS) {
    if (growthSource[itemColor] !== undefined) {
      growthByColor[itemColor] = normalizeGrowth(growthSource[itemColor]);
    }
  }

  const representativeColor = color(value.representativeColor);
  const equippedFloorByColor = normalizeFloorsByColor(value.equippedFloorByColor);
  return {
    balance: Math.max(0, Math.trunc(numberValue(value.balance))),
    unitLabel:
      isRecord(value.currency) && typeof value.currency.unitLabel === "string"
        ? value.currency.unitLabel
        : "원",
    ownedColors: colorsList(value.ownedColors),
    equippedColors: colorsList(value.equippedColors),
    representativeColor,
    catalog: normalizeCatalog(value.catalog),
    ownedItemKeys: stringList(value.ownedItemKeys),
    equippedItemKeys: stringList(value.equippedItemKeys),
    equippedItemsByColor: normalizeItemsByColor(value.equippedItemsByColor),
    equippedFloorByColor,
    equippedFloor: floor(value.equippedFloor),
    shopCatalog: normalizeShopCatalog(value.shopCatalog),
    growthByColor,
  };
}

export function evolutionForStage(stage: 1 | 2 | 3): SlimeEvolution {
  if (stage === 3) return "silver-crown-blue-gem";
  if (stage === 2) return "gold-crown-red-gem";
  return "base";
}

export function stageForColor(
  home: MobileSlimeHome,
  itemColor: SlimeColor,
): 1 | 2 | 3 {
  return home.growthByColor[itemColor]?.stage ?? 1;
}

export function floorLabel(itemFloor: Exclude<EquippedFloor, "none">): string {
  if (itemFloor === "grass-floor") return "잔디 바닥";
  if (itemFloor === "water-puddle") return "물웅덩이";
  return "트램펄린";
}

export function newSlimeIdempotencyKey(prefix: string, identity: string): string {
  const random = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${identity}-${random ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
