import type { EquippedFloor } from "./slime-assets";
import type { MobileSlimeEffect } from "./slime-buffs";
import type { SlimeColor } from "./slime-assets";
import type {
  SlimeGrowth,
  SlimeCatalogItem,
  SlimeShopItem,
  SlimeWearableRole,
} from "./slime-catalog";
import { EQUIPPED_FLOORS } from "./slime-assets";
import { SLIME_ASSET_COLORS } from "./slime-assets";
import {
  SLIME_COLOR_LABELS,
  SLIME_WEARABLE_ROLES,
  SLIME_COOKIE_ITEM_KEY,
} from "./slime-catalog";

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
  /** Equipped items hidden from sprite composition; buffs still use equipped keys. */
  hiddenItemKeys: string[];
  hiddenItemsByColor: Partial<Record<SlimeColor, string[]>>;
  equippedFloorByColor: Partial<Record<SlimeColor, EquippedFloor>>;
  equippedFloor: EquippedFloor;
  shopCatalog: SlimeShopItem[];
  growthSpeedBps: number;
  growthByColor: Partial<Record<SlimeColor, SlimeGrowth>>;
  effects: { breakdown: MobileSlimeEffect[] };
  walkingTitle: MobileWalkingTitle | null;
  claimedTitles: MobileClaimedTitle[];
  equippedTitleByColor: Partial<Record<SlimeColor, string>>;
};

export type MobileClaimedTitle = {
  key: string;
  label: string;
  imagePath: string;
  effectKey: string;
  buffBps: number;
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
    hiddenItemKeys: string[];
    equippedTitleKey: string | null;
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
  return typeof value === "string" &&
    (SLIME_ASSET_COLORS as readonly string[]).includes(value)
    ? (value as SlimeColor)
    : null;
}

function wearableRole(value: unknown): SlimeWearableRole | null {
  return typeof value === "string" &&
    (SLIME_WEARABLE_ROLES as readonly string[]).includes(value)
    ? (value as SlimeWearableRole)
    : null;
}

function floor(value: unknown): EquippedFloor {
  return typeof value === "string" &&
    (EQUIPPED_FLOORS as readonly string[]).includes(value)
    ? (value as EquippedFloor)
    : "none";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function colorsList(value: unknown): SlimeColor[] {
  if (!Array.isArray(value)) return [];
  return value.map(color).filter((item): item is SlimeColor => item !== null);
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
      Math.trunc(
        numberValue(item.growthAppliedSpeedBps ?? item.appliedSpeedBps),
      ),
    ),
    remainingSeconds: Math.max(
      0,
      Math.trunc(numberValue(item.remainingSeconds)),
    ),
    remainingMinutes: Math.max(
      0,
      Math.trunc(numberValue(item.remainingMinutes)),
    ),
  };
}

function normalizeEffects(value: unknown): { breakdown: MobileSlimeEffect[] } {
  if (!isRecord(value) || !Array.isArray(value.breakdown))
    return { breakdown: [] };
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
      return [
        {
          source: entry.source,
          key: entry.key,
          label: entry.label,
          effectKey: entry.effectKey,
          bps: Math.max(0, Math.trunc(numberValue(entry.bps))),
        },
      ];
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
        purchaseCount: Math.max(
          0,
          Math.trunc(numberValue(entry.purchaseCount)),
        ),
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
      category !== "vehicle" &&
      category !== "drink" &&
      category !== "food" &&
      category !== "prop" &&
      category !== "wearable" &&
      category !== "level-up"
    ) {
      return [];
    }
    const parsedFloor = entry.floor === null ? "none" : floor(entry.floor);
    const itemFloor = parsedFloor === "none" ? null : parsedFloor;
    const parsedWearableRole = wearableRole(entry.wearableRole);
    const tier =
      entry.tier === 1 || entry.tier === 2 || entry.tier === 3
        ? entry.tier
        : undefined;
    return [
      {
        key: entry.key,
        category,
        floor: itemFloor,
        labelKo: typeof entry.labelKo === "string" ? entry.labelKo : entry.key,
        price: Math.max(0, Math.trunc(numberValue(entry.price))),
        tier,
        spritePath:
          typeof entry.spritePath === "string" ? entry.spritePath : "",
        mobileSpritePath:
          typeof entry.mobileSpritePath === "string"
            ? entry.mobileSpritePath
            : undefined,
        staticSpritePath:
          typeof entry.staticSpritePath === "string"
            ? entry.staticSpritePath
            : undefined,
        animationKey:
          typeof entry.animationKey === "string"
            ? entry.animationKey
            : undefined,
        previewColor: SLIME_ASSET_COLORS.includes(
          entry.previewColor as SlimeColor,
        )
          ? (entry.previewColor as SlimeColor)
          : undefined,
        wearableRole: parsedWearableRole ?? undefined,
        wearableOption:
          typeof entry.wearableOption === "string" &&
          entry.wearableOption.length > 0
            ? entry.wearableOption
            : undefined,
        wearableAssetPath:
          typeof entry.wearableAssetPath === "string" &&
          entry.wearableAssetPath.length > 0
            ? entry.wearableAssetPath
            : undefined,
        // Vehicle fields have to survive normalization or the ride never renders
        // on mobile even though the server sent it.
        vehicleStance:
          entry.vehicleStance === "grounded" ||
          entry.vehicleStance === "floating"
            ? entry.vehicleStance
            : undefined,
        vehicleRiseY:
          typeof entry.vehicleRiseY === "number"
            ? Math.max(0, Math.trunc(entry.vehicleRiseY))
            : undefined,
        vehicleOffsetX:
          typeof entry.vehicleOffsetX === "number"
            ? Math.trunc(entry.vehicleOffsetX)
            : undefined,
        vehicleGroundedSpritePath:
          typeof entry.vehicleGroundedSpritePath === "string"
            ? entry.vehicleGroundedSpritePath
            : undefined,
        vehicleEffectSpritePaths: Array.isArray(entry.vehicleEffectSpritePaths)
          ? entry.vehicleEffectSpritePaths.filter(
              (path): path is string =>
                typeof path === "string" && path.length > 0,
            )
          : undefined,
        vehicleFrameCount:
          typeof entry.vehicleFrameCount === "number"
            ? Math.max(1, Math.trunc(entry.vehicleFrameCount))
            : undefined,
        vehicleGroundedFrameCount:
          typeof entry.vehicleGroundedFrameCount === "number"
            ? Math.max(1, Math.trunc(entry.vehicleGroundedFrameCount))
            : undefined,
        vehicleGroundedFrameDurationMs:
          typeof entry.vehicleGroundedFrameDurationMs === "number"
            ? Math.max(16, Math.trunc(entry.vehicleGroundedFrameDurationMs))
            : undefined,
        vehicleCanvasHeight:
          typeof entry.vehicleCanvasHeight === "number"
            ? Math.max(64, Math.trunc(entry.vehicleCanvasHeight))
            : undefined,
        vehicleCharacterOffsetY:
          typeof entry.vehicleCharacterOffsetY === "number"
            ? Math.max(0, Math.trunc(entry.vehicleCharacterOffsetY))
            : undefined,
        vehicleBobY: Array.isArray(entry.vehicleBobY)
          ? entry.vehicleBobY
              .filter((value): value is number => typeof value === "number")
              .map((value) => Math.trunc(value))
          : undefined,
        vehicleSheetPath:
          typeof entry.vehicleSheetPath === "string"
            ? entry.vehicleSheetPath
            : undefined,
        effectKey:
          typeof entry.effectKey === "string" ? entry.effectKey : undefined,
        purchaseCount: Math.max(
          0,
          Math.trunc(numberValue(entry.purchaseCount)),
        ),
        effectBps:
          typeof entry.effectBps === "number"
            ? Math.max(0, Math.trunc(entry.effectBps))
            : undefined,
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

function normalizeOptionalItemsByColor(
  value: unknown,
): Partial<Record<SlimeColor, string[]>> {
  if (!isRecord(value)) return {};
  const result: Partial<Record<SlimeColor, string[]>> = {};
  for (const itemColor of SLIME_ASSET_COLORS) {
    if (itemColor in value) result[itemColor] = stringList(value[itemColor]);
  }
  return result;
}

function normalizeFloorsByColor(
  value: unknown,
): Partial<Record<SlimeColor, EquippedFloor>> {
  if (!isRecord(value)) return {};
  const result: Partial<Record<SlimeColor, EquippedFloor>> = {};
  for (const itemColor of SLIME_ASSET_COLORS) {
    if (value[itemColor] !== undefined)
      result[itemColor] = floor(value[itemColor]);
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
  const equippedFloorByColor = normalizeFloorsByColor(
    value.equippedFloorByColor,
  );
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
    hiddenItemKeys: stringList(value.hiddenItemKeys),
    hiddenItemsByColor: normalizeOptionalItemsByColor(value.hiddenItemsByColor),
    equippedFloorByColor,
    equippedFloor: floor(value.equippedFloor),
    shopCatalog: normalizeShopCatalog(value.shopCatalog),
    growthSpeedBps: Math.max(0, Math.trunc(numberValue(value.growthSpeedBps))),
    growthByColor,
    effects: normalizeEffects(value.effects),
    walkingTitle: walkingTitle(value.walkingTitle),
    claimedTitles: normalizeClaimedTitles(value.claimedTitles),
    equippedTitleByColor: normalizeTitlesByColor(value.equippedTitleByColor),
  };
}

function normalizeClaimedTitles(value: unknown): MobileClaimedTitle[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    if (
      typeof entry.key !== "string" ||
      typeof entry.label !== "string" ||
      typeof entry.imagePath !== "string"
    ) {
      return [];
    }
    return [
      {
        key: entry.key,
        label: entry.label,
        imagePath: entry.imagePath,
        effectKey: typeof entry.effectKey === "string" ? entry.effectKey : "",
        buffBps: Math.max(0, Math.trunc(numberValue(entry.buffBps))),
      },
    ];
  });
}

function normalizeTitlesByColor(
  value: unknown,
): Partial<Record<SlimeColor, string>> {
  if (!isRecord(value)) return {};
  const result: Partial<Record<SlimeColor, string>> = {};
  for (const [key, titleKey] of Object.entries(value)) {
    const slimeColor = color(key);
    if (slimeColor && typeof titleKey === "string" && titleKey.length > 0) {
      result[slimeColor] = titleKey;
    }
  }
  return result;
}

export function normalizeSlimeClassroom(
  payload: unknown,
): MobileSlimeClassmate[] {
  if (!isRecord(payload) || !Array.isArray(payload.students)) return [];
  return payload.students.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.name !== "string"
    ) {
      return [];
    }
    const representative = isRecord(entry.representative)
      ? entry.representative
      : null;
    const representativeColor = representative
      ? color(representative.color)
      : null;
    return [
      {
        id: entry.id,
        number:
          typeof entry.number === "number" && Number.isFinite(entry.number)
            ? Math.trunc(entry.number)
            : null,
        name: entry.name,
        walkingTitle: walkingTitle(entry.walkingTitle),
        representative:
          representative && representativeColor
            ? {
                color: representativeColor,
                growthStage: stageValue(representative.growthStage),
                equippedItemKeys: stringList(representative.equippedItemKeys),
                hiddenItemKeys: stringList(representative.hiddenItemKeys),
                equippedTitleKey:
                  typeof representative.equippedTitleKey === "string" &&
                  representative.equippedTitleKey.length > 0
                    ? representative.equippedTitleKey
                    : null,
              }
            : null,
      },
    ];
  });
}
