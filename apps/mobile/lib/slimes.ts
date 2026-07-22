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
  2: "은 왕관 · 파랑 보석",
  3: "금 왕관 · 빨강 보석",
};

export type SlimeGrowth = {
  stage: 1 | 2 | 3;
  growthSeconds: number;
  growthAppliedSpeedBps: number;
  remainingSeconds: number;
  remainingMinutes: number;
};

export type MobileSlimeEffect = {
  source: string;
  key: string;
  label: string;
  effectKey: string;
  bps: number;
};

export type SlimeCatalogItem = {
  key: SlimeColor;
  color: SlimeColor;
  nameKo: string;
  effectKey: string;
  baseBuffBps: number;
  price: number;
};

export type SlimeShopItem = {
  key: string;
  category: "background" | "ride" | "drink" | "food" | "prop" | "level-up";
  floor: Exclude<EquippedFloor, "none"> | null;
  labelKo: string;
  price: number;
  spritePath: string;
};

export type SlimeShopFilter = "character" | "floor" | "food" | "prop" | "level-up";

export const SLIME_SHOP_NAV_ITEMS: readonly { key: SlimeShopFilter; label: string }[] = [
  { key: "character", label: "캐릭터" },
  { key: "floor", label: "바닥" },
  { key: "food", label: "먹이" },
  { key: "prop", label: "소품" },
];

export const SLIME_COOKIE_ITEM_KEY = "slime-cookie";

export function slimeBallSpritePath(
  itemKeys: readonly string[],
  slimeColor: SlimeColor,
): string | undefined {
  const key = itemKeys.find((itemKey) => itemKey.startsWith("slime-ball-"));
  if (!key) return undefined;
  const slug = key.slice("slime-ball-".length);
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return undefined;
  return `/creatures/slimes/official/props/ball/${slug}/${slimeColor}/slime-${slimeColor}-${slug}-hit-4x.gif`;
}

export function studentPetHref(section: "mine" | "classroom"): string {
  return `/(student)/slime?section=${section}`;
}

export type MobileSlimeHome = {
  balance: number;
  unitLabel: string;
  ownedColors: SlimeColor[];
  equippedColors: SlimeColor[];
  representativeColor: SlimeColor | null;
  catalog: SlimeCatalogItem[];
  ownedItemKeys: string[];
  ownedItemQuantities: Record<string, number>;
  equippedItemKeys: string[];
  equippedItemsByColor: Partial<Record<SlimeColor, string[]>>;
  equippedFloorByColor: Partial<Record<SlimeColor, EquippedFloor>>;
  equippedFloor: EquippedFloor;
  shopCatalog: SlimeShopItem[];
  growthSpeedBps: number;
  growthByColor: Partial<Record<SlimeColor, SlimeGrowth>>;
  effects: { breakdown: MobileSlimeEffect[] };
  walkingTitle: MobileWalkingTitle | null;
};

export type MobileSlimeClassmate = {
  id: string;
  number: number | null;
  name: string;
  walkingTitle: MobileWalkingTitle | null;
  representative: {
    color: SlimeColor;
    growthStage: 1 | 2 | 3;
    equippedItemKeys: string[];
  } | null;
};

export type MobileWalkingTitle = {
  key: string;
  label: string;
  imagePath: string;
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

function walkingTitle(value: unknown): MobileWalkingTitle | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.key !== "string" ||
    typeof value.label !== "string" ||
    typeof value.imagePath !== "string"
  ) {
    return null;
  }
  return { key: value.key, label: value.label, imagePath: value.imagePath };
}

function normalizeGrowth(value: unknown): SlimeGrowth {
  const item = isRecord(value) ? value : {};
  return {
    stage: stageValue(item.stage),
    growthSeconds: Math.max(0, Math.trunc(numberValue(item.growthSeconds))),
    growthAppliedSpeedBps: Math.max(
      0,
      Math.trunc(numberValue(item.growthAppliedSpeedBps ?? item.appliedSpeedBps)),
    ),
    remainingSeconds: Math.max(0, Math.trunc(numberValue(item.remainingSeconds))),
    remainingMinutes: Math.max(0, Math.trunc(numberValue(item.remainingMinutes))),
  };
}

function normalizeEffects(value: unknown): { breakdown: MobileSlimeEffect[] } {
  if (!isRecord(value) || !Array.isArray(value.breakdown)) return { breakdown: [] };
  return {
    breakdown: value.breakdown.flatMap((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.source !== "string" ||
        typeof entry.key !== "string" ||
        typeof entry.label !== "string" ||
        typeof entry.effectKey !== "string"
      ) {
        return [];
      }
      return [{
        source: entry.source,
        key: entry.key,
        label: entry.label,
        effectKey: entry.effectKey,
        bps: Math.max(0, Math.trunc(numberValue(entry.bps))),
      }];
    }),
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
        baseBuffBps: Math.max(0, Math.trunc(numberValue(entry.baseBuffBps))),
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
    if (
      category !== "background" &&
      category !== "ride" &&
      category !== "drink" &&
      category !== "food" &&
      category !== "prop" &&
      category !== "level-up"
    ) {
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
        spritePath: typeof entry.spritePath === "string" ? entry.spritePath : "",
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

function normalizeQuantities(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, quantity] of Object.entries(value)) {
    result[key] = Math.max(0, Math.trunc(numberValue(quantity)));
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
  const ownedItemKeys = stringList(value.ownedItemKeys);
  const ownedItemQuantities = normalizeQuantities(value.ownedItemQuantities);
  if (
    ownedItemKeys.includes(SLIME_COOKIE_ITEM_KEY) &&
    ownedItemQuantities[SLIME_COOKIE_ITEM_KEY] === undefined
  ) {
    ownedItemQuantities[SLIME_COOKIE_ITEM_KEY] = 1;
  }
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
    ownedItemKeys,
    ownedItemQuantities,
    equippedItemKeys: stringList(value.equippedItemKeys),
    equippedItemsByColor: normalizeItemsByColor(value.equippedItemsByColor),
    equippedFloorByColor,
    equippedFloor: floor(value.equippedFloor),
    shopCatalog: normalizeShopCatalog(value.shopCatalog),
    growthSpeedBps: Math.max(0, Math.trunc(numberValue(value.growthSpeedBps))),
    growthByColor,
    effects: normalizeEffects(value.effects),
    walkingTitle: walkingTitle(value.walkingTitle),
  };
}

export function normalizeSlimeClassroom(payload: unknown): MobileSlimeClassmate[] {
  if (!isRecord(payload) || !Array.isArray(payload.students)) return [];
  return payload.students.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string") {
      return [];
    }
    const representative = isRecord(entry.representative) ? entry.representative : null;
    const representativeColor = representative ? color(representative.color) : null;
    return [{
      id: entry.id,
      number:
        typeof entry.number === "number" && Number.isFinite(entry.number)
          ? Math.trunc(entry.number)
          : null,
      name: entry.name,
      walkingTitle: walkingTitle(entry.walkingTitle),
      representative: representative && representativeColor
        ? {
            color: representativeColor,
            growthStage: stageValue(representative.growthStage),
            equippedItemKeys: stringList(representative.equippedItemKeys),
          }
        : null,
    }];
  });
}

export function shopFilterForItem(item: Pick<SlimeShopItem, "category">): Exclude<SlimeShopFilter, "character"> {
  if (item.category === "background" || item.category === "ride") return "floor";
  if (item.category === "food") return "food";
  if (item.category === "level-up") return "level-up";
  return "prop";
}

const STAGE_START_SECONDS: Record<1 | 2 | 3, number> = {
  1: 0,
  2: 10 * 86_400,
  3: 25 * 86_400,
};

export function calculateSlimeGrowthPercent(
  growth: Pick<SlimeGrowth, "stage" | "growthSeconds">,
): number {
  if (growth.stage >= 3) return 100;
  const start = STAGE_START_SECONDS[growth.stage];
  const target = STAGE_START_SECONDS[(growth.stage + 1) as 2 | 3];
  if (target <= start) return 100;
  return Math.min(
    100,
    Math.max(0, Math.round(((growth.growthSeconds - start) / (target - start)) * 100)),
  );
}

/** Stage one uses the catalog base buff; later stages double it each time. */
export function slimeBuffBpsForStage(baseBuffBps: number, stage: 1 | 2 | 3): number {
  const base = Number.isFinite(baseBuffBps) ? Math.max(0, Math.round(baseBuffBps)) : 0;
  return stage === 3 ? base * 4 : stage === 2 ? base * 2 : base;
}

export function calculateGrowthTimeComparison(
  remainingEffectiveSeconds: number,
  growthSpeedBps: number,
) {
  const withoutBuffSeconds = Math.max(0, Math.ceil(remainingEffectiveSeconds));
  const safeBps = Number.isFinite(growthSpeedBps)
    ? Math.max(0, Math.round(growthSpeedBps))
    : 0;
  return {
    withoutBuffSeconds,
    withBuffSeconds: Math.ceil((withoutBuffSeconds * 10_000) / (10_000 + safeBps)),
  };
}

export function formatGrowthHours(seconds: number): string {
  const hours = Math.round((Math.max(0, seconds) / 3_600) * 10) / 10;
  return `${hours.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}시간`;
}

export function evolutionForStage(stage: 1 | 2 | 3): SlimeEvolution {
  if (stage === 3) return "gold-crown-red-gem";
  if (stage === 2) return "silver-crown-blue-gem";
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
