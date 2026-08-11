import type {
  SlimeAccessoryDefinition,
  SlimeColor,
  SlimeBallShopItem,
  SlimeBallSlug,
  SlimeDefinition,
  SlimeFloor,
  SlimeShopItem,
  SlimeSetDefinition,
  SlimeShopTier,
} from "./types";
import { SLIME_SHARED_ASSETS } from "./slime-assets";
import { SLIME_BALL_SLUGS, SLIME_COLORS } from "./types";
import { SLIME_WEARABLE_CATALOG } from "./wearable-catalog";
import { slimeWearableEntry } from "./slime-wearables";
import { SLIME_ASSET_ROOT } from "./asset-base";

export { SLIME_ASSET_ROOT, slimeAssetUrl, SLIME_ASSET_RELEASE } from "./asset-base";
export const SLIME_DEFAULT_PRICE = 500;
export const SLIME_DEFAULT_BUFF_BPS = 200;
export const SLIME_SHOP_DEFAULT_PRICE = 500;
export const SLIME_COOKIE_PRICE = 30;
export const SLIME_BALL_PRICE = SLIME_SHOP_DEFAULT_PRICE;
export const SLIME_SHOP_LOWER_TIER_EFFECT_BPS = 100;
/**
 * Default pixels a grounded vehicle lifts the slime.
 *
 * Static floors all place the slime's feet at `slimeFootY` 56 over a surface at
 * 44, so a grounded vehicle owns the 12px between them and seats the slime just
 * above its own rim. Floating vehicles override this with a larger rise.
 */
export const SLIME_VEHICLE_DEFAULT_RISE_Y = 6;
/**
 * Frames in a vehicle sheet.
 *
 * Vehicles animate on the same 8-frame clock as the slime idle timeline, with
 * matching durations, so a ride and its rider never drift apart.
 */
export const SLIME_VEHICLE_FRAME_COUNT = 8;

/**
 * Height of an authored vehicle canvas, and where the character sits inside it.
 *
 * Vehicles are drawn taller than the 64px character viewport so a balloon can
 * climb above the grounded pose. The renderer subtracts the offset to land that
 * art back on the viewport, matching how jump wearables already work.
 */
export const SLIME_VEHICLE_CANVAS_HEIGHT = 81;
export const SLIME_VEHICLE_CHARACTER_OFFSET_Y = 17;

const VEHICLE_ROOT = `${SLIME_ASSET_ROOT}/shop/vehicles`;

const SLIME_VEHICLE_TIER_PRICE = {
  1: 1_000,
  2: 700,
  3: 500,
} as const satisfies Record<SlimeShopTier, number>;

const SLIME_VEHICLE_TIER_BPS = {
  1: 300,
  2: 200,
  3: 100,
} as const satisfies Record<SlimeShopTier, number>;

/**
 * Vehicles delivered as front-only art on the taller canvas.
 *
 * `bobY` is authored per frame and the rider follows it, so a passenger never
 * slides out of a seat moving under it. Prices follow the existing tiers.
 */
const VEHICLE_DEFINITIONS = [
  {
    option: "donut-tube",
    labelKo: "도넛 튜브",
    tier: 3,
    stance: "grounded",
    riseY: 10,
    bobY: [0, -1, -1, -2, -2, -1, -1, 0],
    effectKey: "walking_reward",
  },
  {
    option: "open-convertible",
    labelKo: "오픈카",
    tier: 1,
    stance: "grounded",
    riseY: 6,
    bobY: [0, 0, -1, -1, -1, -1, 0, 0],
    effectKey: "walking_reward",
    // Wheels keep their own constant-rate timeline; a wheel that rose with the
    // suspension would leave the ground and lift the whole sprite.
    wheels: { frameCount: 4, frameDurationMs: 100 },
    vehicleEffectSpritePaths: [
      `${VEHICLE_ROOT}/open-convertible/fx/wind-idle-sheet.png`,
    ],
  },
  {
    option: "hot-air-balloon",
    labelKo: "열기구",
    tier: 1,
    stance: "floating",
    riseY: 9,
    bobY: [0, -1, -2, -2, -2, -1, -1, 0],
    effectKey: "reading_reward",
  },
  {
    option: "cloud",
    labelKo: "구름",
    tier: 2,
    stance: "floating",
    riseY: 23,
    bobY: [0, -1, -2, -2, -2, -1, -1, 0],
    effectKey: "reading_reward",
  },
  {
    option: "duck-tube",
    labelKo: "러버덕 튜브",
    tier: 2,
    stance: "grounded",
    riseY: 14,
    bobY: [0, -1, -1, -2, -2, -1, -1, 0],
    effectKey: "walking_reward",
  },
  {
    option: "go-kart",
    labelKo: "고카트",
    // The approved art replaced files at the same public paths. Bump the URL so
    // Expo Image and browser disk caches do not keep rendering the retired kart.
    assetVersion: "20260805",
    tier: 2,
    stance: "grounded",
    // The authored front wheel reaches y=72 while the right rear wheel reaches
    // y=67. Lower the whole composite by 5px so the rear wheel owns contact.
    riseY: 9,
    characterOffsetY: 12,
    bobY: [0, 0, -1, -1, -1, -1, 0, 0],
    effectKey: "walking_reward",
    vehicleEffectSpritePaths: [
      `${VEHICLE_ROOT}/go-kart/fx/wind-idle-sheet.png`,
      `${VEHICLE_ROOT}/go-kart/fx/exhaust-idle-sheet.png`,
    ],
  },
  {
    option: "wooden-cart",
    labelKo: "나무수레",
    tier: 3,
    stance: "grounded",
    // The right rear wheel ends at y=68, 4px above the previous bbox contact.
    riseY: 17,
    characterOffsetY: 13,
    bobY: [0, 0, -1, -1, -1, -1, 0, 0],
    effectKey: "assignment_reward",
    vehicleEffectSpritePaths: [
      `${VEHICLE_ROOT}/wooden-cart/fx/wind-idle-sheet.png`,
    ],
  },
  {
    option: "kayak",
    labelKo: "카약",
    tier: 2,
    stance: "grounded",
    riseY: 15,
    bobY: [0, -1, -1, -2, -2, -1, -1, 0],
    effectKey: "reading_reward",
  },
  {
    option: "skateboard",
    labelKo: "스케이트보드",
    tier: 3,
    stance: "grounded",
    riseY: 13,
    bobY: [0, 0, 0, 0, 0, 0, 0, 0],
    effectKey: "walking_reward",
    wheels: { frameCount: 4, frameDurationMs: 100 },
    vehicleEffectSpritePaths: [
      `${VEHICLE_ROOT}/skateboard/fx/wind-idle-sheet.png`,
    ],
  },
  {
    option: "flying-broom",
    labelKo: "하늘 빗자루",
    tier: 2,
    stance: "floating",
    riseY: 13,
    bobY: [0, -1, -2, -2, -2, -1, -1, 0],
    effectKey: "assignment_reward",
    vehicleEffectSpritePaths: [
      `${VEHICLE_ROOT}/flying-broom/fx/wind-idle-sheet.png`,
    ],
  },
  {
    option: "swan-boat",
    labelKo: "백조 보트",
    tier: 1,
    stance: "grounded",
    riseY: 16,
    bobY: [0, -1, -1, -2, -2, -1, -1, 0],
    effectKey: "comment_reward",
  },
  {
    option: "magic-carpet",
    labelKo: "마법 양탄자",
    tier: 1,
    stance: "floating",
    riseY: 14,
    bobY: [0, -1, -2, -2, -2, -1, -1, 0],
    effectKey: "growth_speed",
    vehicleEffectSpritePaths: [
      `${VEHICLE_ROOT}/magic-carpet/fx/sparkle-idle-sheet.png`,
    ],
  },
  {
    option: "bumper-car",
    labelKo: "범퍼카",
    tier: 2,
    stance: "grounded",
    riseY: 11,
    bobY: [0, 0, 0, 0, 0, 0, 0, 0],
    effectKey: "walking_reward",
    wheels: { frameCount: 4, frameDurationMs: 100 },
  },
  {
    option: "carousel-horse",
    labelKo: "회전목마",
    tier: 1,
    stance: "grounded",
    riseY: 23,
    bobY: [0, -1, -2, -2, -2, -1, -1, 0],
    effectKey: "assignment_reward",
    vehicleOffsetX: -4,
  },
  {
    option: "flamingo-tube",
    labelKo: "플라밍고 튜브",
    tier: 2,
    stance: "grounded",
    riseY: 15,
    bobY: [0, -1, -1, -2, -2, -1, -1, 0],
    effectKey: "comment_reward",
    vehicleOffsetX: -4,
  },
  {
    option: "soap-bubble",
    labelKo: "비눗방울",
    tier: 2,
    stance: "floating",
    riseY: 2,
    bobY: [0, -1, -2, -2, -2, -1, -1, 0],
    effectKey: "growth_speed",
    vehicleEffectSpritePaths: [
      `${VEHICLE_ROOT}/soap-bubble/fx/glint-idle-sheet.png`,
    ],
  },
  {
    option: "crescent-moon",
    labelKo: "초승달",
    tier: 1,
    stance: "floating",
    riseY: 9,
    bobY: [0, -1, -2, -2, -2, -1, -1, 0],
    effectKey: "reading_reward",
    // The approved rider is 4px right of center, and delivery extraction moved
    // the two-pixel left overhang into the sheet. Undo both without moving the rider.
    vehicleOffsetX: -6,
    vehicleEffectSpritePaths: [
      `${VEHICLE_ROOT}/crescent-moon/fx/stars-idle-sheet.png`,
    ],
  },
] as const satisfies readonly {
  option: string;
  labelKo: string;
  tier: SlimeShopTier;
  stance: "grounded" | "floating";
  riseY: number;
  bobY: readonly number[];
  effectKey: NonNullable<SlimeShopItem["effectKey"]>;
  wheels?: { frameCount: number; frameDurationMs: number };
  characterOffsetY?: number;
  vehicleOffsetX?: number;
  assetVersion?: string;
  vehicleEffectSpritePaths?: readonly string[];
}[];

export const SLIME_VEHICLE_CATALOG: readonly SlimeShopItem[] = VEHICLE_DEFINITIONS.map(
  (vehicle): SlimeShopItem => {
    const assetVersion = "assetVersion" in vehicle ? vehicle.assetVersion : undefined;
    const assetVersionSuffix = assetVersion ? `?v=${assetVersion}` : "";
    return {
    key: `slime-vehicle-${vehicle.option}`,
    category: "vehicle",
    floor: null,
    labelKo: vehicle.labelKo,
    tier: vehicle.tier,
    price: SLIME_VEHICLE_TIER_PRICE[vehicle.tier],
    vehicleStance: vehicle.stance,
    vehicleRiseY: vehicle.riseY,
    vehicleBobY: vehicle.bobY,
    vehicleFrameCount: SLIME_VEHICLE_FRAME_COUNT,
    vehicleCanvasHeight: SLIME_VEHICLE_CANVAS_HEIGHT,
    vehicleCharacterOffsetY: "characterOffsetY" in vehicle
      ? vehicle.characterOffsetY
      : SLIME_VEHICLE_CHARACTER_OFFSET_Y,
    ...("vehicleOffsetX" in vehicle && vehicle.vehicleOffsetX !== undefined
      ? { vehicleOffsetX: vehicle.vehicleOffsetX }
      : {}),
    effectKey: vehicle.effectKey,
    effectBps: SLIME_VEHICLE_TIER_BPS[vehicle.tier],
    // The still frame doubles as the shop card image.
    spritePath: `${VEHICLE_ROOT}/${vehicle.option}/vehicle.png${assetVersionSuffix}`,
    vehicleSheetPath: `${VEHICLE_ROOT}/${vehicle.option}/idle-sheet.png${assetVersionSuffix}`,
    ...("wheels" in vehicle && vehicle.wheels
      ? {
          vehicleGroundedSpritePath: `${VEHICLE_ROOT}/${vehicle.option}/wheels-idle-sheet.png`,
          vehicleGroundedFrameCount: vehicle.wheels.frameCount,
          vehicleGroundedFrameDurationMs: vehicle.wheels.frameDurationMs,
        }
      : {}),
    ...("vehicleEffectSpritePaths" in vehicle && vehicle.vehicleEffectSpritePaths
      ? {
          vehicleEffectSpritePaths: vehicle.vehicleEffectSpritePaths.map(
            (path) => `${path}${assetVersionSuffix}`,
          ),
        }
      : {}),
    };
  },
);
/**
 * Upper bound for one consumable purchase.
 *
 * Keeps a mistyped quantity from draining a student's wallet in a single tap
 * while still covering a realistic cookie restock.
 */
export const SLIME_MAX_PURCHASE_QUANTITY = 99;


const STATIC_FLOOR_DEFINITIONS = [
  ["crystal-cave-floor", "수정 동굴 바닥", 1, "growth_speed"],
  ["moonlit-marble-floor", "달빛 대리석 바닥", 1, "reading_reward"],
  ["royal-garden-floor", "왕실 정원 바닥", 1, "walking_reward"],
  ["celestial-gold-floor", "천상의 황금 바닥", 1, "assignment_reward"],
  ["snow-ground-floor", "눈밭", 2, "comment_reward"],
  ["ancient-brick-floor", "고대 벽돌 바닥", 2, "assignment_reward"],
  ["cherry-stone-floor", "벚꽃 돌바닥", 2, "comment_reward"],
  ["sand-trail-floor", "모래길 바닥", 3, "walking_reward"],
  ["forest-soil-floor", "숲 흙바닥", 3, "reading_reward"],
  ["stone-floor", "돌바닥", 3, "growth_speed"],
] as const satisfies readonly [
  Exclude<SlimeFloor, "none" | "grass-floor">,
  string,
  1 | 2 | 3,
  NonNullable<SlimeShopItem["effectKey"]>,
][];

const STATIC_FLOOR_TIER_PRICE = { 1: 1_000, 2: 700, 3: 500 } as const;
const STATIC_FLOOR_TIER_BPS = { 1: 300, 2: 200, 3: 100 } as const;

export const SLIME_STATIC_FLOOR_CATALOG: readonly SlimeShopItem[] =
  STATIC_FLOOR_DEFINITIONS.map(([id, labelKo, tier, effectKey]) => ({
    key: id,
    category: "background",
    floor: id,
    labelKo,
    price: STATIC_FLOOR_TIER_PRICE[tier],
    effectKey,
    effectBps: STATIC_FLOOR_TIER_BPS[tier],
    spritePath: `${SLIME_ASSET_ROOT}/official/shared/floors/${id}.png`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/official/shared/floors/${id}.png`,
  }));

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

const SLIME_BALL_PREVIEW_COLOR: SlimeColor = "blue";

const slimeBallPreviewPath = (slug: SlimeBallSlug): string =>
  `${SLIME_ASSET_ROOT}/official/props/ball/${slug}/${SLIME_BALL_PREVIEW_COLOR}/slime-${SLIME_BALL_PREVIEW_COLOR}-${slug}-hit-4x.gif`;

const SLIME_BALL_LABELS: Readonly<Record<SlimeBallSlug, string>> = {
  "american-football": "미식축구공",
  baseball: "야구공",
  basketball: "농구공",
  "black-ball": "당구공",
  "dark-blue-ball": "볼링공",
  "soccer-ball": "축구공",
  "tennis-ball": "테니스공",
};

/** Ball props use the matching colour animation when equipped. */
export const SLIME_BALL_CATALOG: readonly SlimeBallShopItem[] = SLIME_BALL_SLUGS.map((slug) => ({
  key: `slime-ball-${slug}`,
  slug,
  category: "prop",
  floor: null,
  labelKo: SLIME_BALL_LABELS[slug],
  price: SLIME_BALL_PRICE,
  effectKey: "walking_reward",
  effectBps: SLIME_SHOP_LOWER_TIER_EFFECT_BPS,
  spritePath: slimeBallPreviewPath(slug),
  /**
   * Cycle the slime colours across the ball previews.
   *
   * Every ball renders on the same slime otherwise, which makes the shop grid a
   * row of identical blue blobs and hides the only thing that differs. Cycling
   * needs no per-ball decision and stays correct as balls are added.
   */
  previewColor: SLIME_COLORS[SLIME_BALL_SLUGS.indexOf(slug) % SLIME_COLORS.length],
}));

/** Alias kept explicit for callers that distinguish shop props from all items. */
export const SLIME_BALL_SHOP_CATALOG = SLIME_BALL_CATALOG;

const SLIME_DRINK_ROOT = `${SLIME_ASSET_ROOT}/shop/drinks`;
/**
 * Shop previews for drinks.
 *
 * `previewColor` is deliberately never the drink's own colour. A yellow lemonade
 * on a yellow slime, or blue ramune on a blue slime, loses the contrast that makes
 * the drink readable, and the blue ramune art additionally drops its highlight
 * pixels on a blue body. Each drink therefore previews on a contrasting slime, and
 * the five are kept distinct so the shop grid never repeats a body colour.
 */
const SLIME_DRINK_DEFINITIONS = [
  {
    key: "slime-blue-drink-lemonade",
    animationKey: "lemonade",
    previewColor: "blue",
    labelKo: "레모네이드",
    effectKey: "walking_reward",
  },
  {
    key: "slime-red-drink-strawberry-soda",
    animationKey: "strawberry-soda",
    previewColor: "green",
    labelKo: "딸기 소다",
    effectKey: "comment_reward",
  },
  {
    key: "slime-green-drink-melon-soda",
    animationKey: "melon-soda",
    previewColor: "purple",
    labelKo: "멜론 소다",
    effectKey: "reading_reward",
  },
  {
    key: "slime-purple-drink-grape-soda",
    animationKey: "grape-soda",
    previewColor: "yellow",
    labelKo: "포도 소다",
    effectKey: "assignment_reward",
  },
  {
    key: "slime-blue-drink-blue-ramune",
    animationKey: "blue-ramune",
    previewColor: "red",
    labelKo: "블루 하와이 소다",
    effectKey: "growth_speed",
  },
] as const satisfies readonly {
  key: string;
  animationKey: string;
  previewColor: SlimeColor;
  labelKo: string;
  effectKey: NonNullable<SlimeShopItem["effectKey"]>;
}[];

export function slimeDrinkSpritePath(
  item: Pick<SlimeShopItem, "category" | "animationKey">,
  slimeColor: SlimeColor,
  highDensity = false,
): string | undefined {
  if (item.category !== "drink" || !item.animationKey) return undefined;
  const base = `slime-${slimeColor}-drink-${item.animationKey}`;
  return `${SLIME_DRINK_ROOT}/${item.animationKey}/${slimeColor}/${base}${highDensity ? "-4x" : ""}.gif`;
}

export const SLIME_DRINK_CATALOG: readonly SlimeShopItem[] = SLIME_DRINK_DEFINITIONS.map(
  (definition) => ({
    key: definition.key,
    category: "drink",
    floor: null,
    labelKo: definition.labelKo,
    price: SLIME_SHOP_DEFAULT_PRICE,
    animationKey: definition.animationKey,
    previewColor: definition.previewColor,
    effectKey: definition.effectKey,
    effectBps: SLIME_SHOP_LOWER_TIER_EFFECT_BPS,
    spritePath: slimeDrinkSpritePath(
      { category: "drink", animationKey: definition.animationKey },
      definition.previewColor,
    )!,
    mobileSpritePath: slimeDrinkSpritePath(
      { category: "drink", animationKey: definition.animationKey },
      definition.previewColor,
      true,
    )!,
  }),
);

export function slimeShopPreviewColor(
  item: Pick<SlimeShopItem, "previewColor">,
  fallback: SlimeColor,
): SlimeColor {
  return item.previewColor ?? fallback;
}

/** Student-owned slime home items sold through the shared won wallet. */
