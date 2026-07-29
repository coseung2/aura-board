import type {
  SlimeAccessoryDefinition,
  SlimeColor,
  SlimeBallShopItem,
  SlimeBallSlug,
  SlimeDefinition,
  SlimeFloor,
  SlimeShopItem,
  SlimeSetDefinition,
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
    price: 500,
    stance: "grounded",
    riseY: 10,
    bobY: [0, -1, -1, -2, -2, -1, -1, 0],
    effectKey: "walking_reward",
    effectBps: 100,
  },
  {
    option: "open-convertible",
    labelKo: "오픈카",
    price: 1_000,
    stance: "grounded",
    riseY: 6,
    bobY: [0, 0, -1, -1, -1, -1, 0, 0],
    effectKey: "walking_reward",
    effectBps: 300,
    // Wheels keep their own constant-rate timeline; a wheel that rose with the
    // suspension would leave the ground and lift the whole sprite.
    wheels: { frameCount: 4, frameDurationMs: 100 },
  },
  {
    option: "hot-air-balloon",
    labelKo: "열기구",
    price: 1_000,
    stance: "floating",
    riseY: 9,
    bobY: [0, -1, -2, -2, -2, -1, -1, 0],
    effectKey: "reading_reward",
    effectBps: 300,
  },
] as const satisfies readonly {
  option: string;
  labelKo: string;
  price: number;
  stance: "grounded" | "floating";
  riseY: number;
  bobY: readonly number[];
  effectKey: NonNullable<SlimeShopItem["effectKey"]>;
  effectBps: number;
  wheels?: { frameCount: number; frameDurationMs: number };
}[];

export const SLIME_VEHICLE_CATALOG: readonly SlimeShopItem[] = VEHICLE_DEFINITIONS.map(
  (vehicle): SlimeShopItem => ({
    key: `slime-vehicle-${vehicle.option}`,
    category: "vehicle",
    floor: null,
    labelKo: vehicle.labelKo,
    price: vehicle.price,
    vehicleStance: vehicle.stance,
    vehicleRiseY: vehicle.riseY,
    vehicleBobY: vehicle.bobY,
    vehicleFrameCount: SLIME_VEHICLE_FRAME_COUNT,
    vehicleCanvasHeight: SLIME_VEHICLE_CANVAS_HEIGHT,
    vehicleCharacterOffsetY: SLIME_VEHICLE_CHARACTER_OFFSET_Y,
    effectKey: vehicle.effectKey,
    effectBps: vehicle.effectBps,
    // The still frame doubles as the shop card image.
    spritePath: `${VEHICLE_ROOT}/${vehicle.option}/vehicle.png`,
    vehicleSheetPath: `${VEHICLE_ROOT}/${vehicle.option}/idle-sheet.png`,
    ...("wheels" in vehicle && vehicle.wheels
      ? {
          vehicleGroundedSpritePath: `${VEHICLE_ROOT}/${vehicle.option}/wheels-idle-sheet.png`,
          vehicleGroundedFrameCount: vehicle.wheels.frameCount,
          vehicleGroundedFrameDurationMs: vehicle.wheels.frameDurationMs,
        }
      : {}),
  }),
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
  "black-ball": "검은 공",
  "dark-blue-ball": "남색 공",
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
export const SLIME_SHOP_CATALOG: readonly SlimeShopItem[] = [
  {
    key: "grass-floor-background",
    category: "background",
    floor: "grass-floor",
    labelKo: "잔디 바닥",
    price: SLIME_SHOP_DEFAULT_PRICE,
    effectKey: "walking_reward",
    effectBps: SLIME_SHOP_LOWER_TIER_EFFECT_BPS,
    spritePath: `${SLIME_ASSET_ROOT}/official/shared/grass-floor.png`,
  },
  ...SLIME_STATIC_FLOOR_CATALOG,
  {
    key: "shooting-star-night-sky-background",
    category: "background",
    floor: null,
    labelKo: "별똥별 밤하늘",
    price: SLIME_SHOP_DEFAULT_PRICE,
    effectKey: "assignment_reward",
    effectBps: SLIME_SHOP_LOWER_TIER_EFFECT_BPS,
    spritePath: `${SLIME_ASSET_ROOT}/shop/shooting-star-night-sky.gif`,
  },
  {
    key: "aurora-dream-sky-background",
    category: "background",
    floor: null,
    labelKo: "오로라의 꿈",
    price: 1_000,
    effectKey: "assignment_reward",
    effectBps: 300,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/aurora-dream-sky/aura-package/aurora-dream-sky-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/aurora-dream-sky/aura-package/aurora-dream-sky-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/aurora-dream-sky/static-background-64.png`,
  },
  {
    key: "cloud-garden-background",
    category: "background",
    floor: null,
    labelKo: "구름 정원",
    price: 700,
    effectKey: "walking_reward",
    effectBps: 200,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/cloud-garden/aura-package/cloud-garden-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/cloud-garden/aura-package/cloud-garden-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/cloud-garden/static-background-64.png`,
  },
  {
    key: "dreamy-toy-room-background",
    category: "background",
    floor: null,
    labelKo: "꿈꾸는 장난감",
    price: 500,
    effectKey: "assignment_reward",
    effectBps: 100,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/dreamy-toy-room/aura-package/dreamy-toy-room-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/dreamy-toy-room/aura-package/dreamy-toy-room-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/dreamy-toy-room/static-background-64.png`,
  },
  {
    key: "enchanted-forest-canopy-background",
    category: "background",
    floor: null,
    labelKo: "숲속의 마법",
    price: 500,
    effectKey: "reading_reward",
    effectBps: 100,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/enchanted-forest-canopy/aura-package/enchanted-forest-canopy-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/enchanted-forest-canopy/aura-package/enchanted-forest-canopy-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/enchanted-forest-canopy/static-background-64.png`,
  },
  {
    key: "fizzy-soda-dream-background",
    category: "background",
    floor: null,
    labelKo: "소다팝",
    price: 700,
    effectKey: "comment_reward",
    effectBps: 200,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/fizzy-soda-dream/aura-package/fizzy-soda-dream-6s-128.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/fizzy-soda-dream/aura-package/fizzy-soda-dream-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/fizzy-soda-dream/static-background-128.png`,
  },
  {
    key: "cherry-cloud-ume-background",
    category: "background",
    floor: null,
    labelKo: "봄날의 구름",
    price: 1_000,
    effectKey: "comment_reward",
    effectBps: 300,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/cherry-cloud-ume/aura-package/cherry-cloud-ume-6s-128.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/cherry-cloud-ume/aura-package/cherry-cloud-ume-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/cherry-cloud-ume/static-background-128.png`,
  },
  {
    key: "four-season-sky-background",
    category: "background",
    floor: null,
    labelKo: "포시즌스",
    price: 1_000,
    effectKey: "walking_reward",
    effectBps: 300,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/four-season-sky/aura-package/four-season-sky-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/four-season-sky/aura-package/four-season-sky-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/four-season-sky/static-background-64.png`,
  },
  {
    key: "jellyfish-ocean-background",
    category: "background",
    floor: null,
    labelKo: "해파리 유영",
    price: 1_000,
    effectKey: "reading_reward",
    effectBps: 300,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/jellyfish-ocean/aura-package/jellyfish-ocean-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/jellyfish-ocean/aura-package/jellyfish-ocean-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/jellyfish-ocean/static-background-64.png`,
  },
  {
    key: "lavender-butterfly-sky-background",
    category: "background",
    floor: null,
    labelKo: "라벤더 나비",
    price: 700,
    effectKey: "reading_reward",
    effectBps: 200,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/lavender-butterfly-sky/aura-package/lavender-butterfly-sky-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/lavender-butterfly-sky/aura-package/lavender-butterfly-sky-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/lavender-butterfly-sky/static-background-64.png`,
  },
  {
    key: "meteor-festival-sky-background",
    category: "background",
    floor: null,
    labelKo: "유성우",
    price: 700,
    effectKey: "walking_reward",
    effectBps: 200,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/meteor-festival-sky/aura-package/meteor-festival-sky-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/meteor-festival-sky/aura-package/meteor-festival-sky-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/meteor-festival-sky/static-background-64.png`,
  },
  {
    key: "midnight-snow-cloud-background",
    category: "background",
    floor: null,
    labelKo: "눈 내리는 밤",
    price: 700,
    effectKey: "assignment_reward",
    effectBps: 200,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/midnight-snow-cloud/aura-package/midnight-snow-cloud-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/midnight-snow-cloud/aura-package/midnight-snow-cloud-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/midnight-snow-cloud/static-background-64.png`,
  },
  {
    key: "moonlit-lake-background",
    category: "background",
    floor: null,
    labelKo: "달빛 호수",
    price: 700,
    effectKey: "reading_reward",
    effectBps: 200,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/moonlit-lake/aura-package/moonlit-lake-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/moonlit-lake/aura-package/moonlit-lake-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/moonlit-lake/static-background-64.png`,
  },
  {
    key: "mushroom-village-background",
    category: "background",
    floor: null,
    labelKo: "버섯 마을",
    price: 700,
    effectKey: "comment_reward",
    effectBps: 200,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/mushroom-village/aura-package/mushroom-village-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/mushroom-village/aura-package/mushroom-village-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/mushroom-village/static-background-64.png`,
  },
  {
    key: "neon-space-station-background",
    category: "background",
    floor: null,
    labelKo: "우주정거장",
    price: 700,
    effectKey: "assignment_reward",
    effectBps: 200,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/neon-space-station/aura-package/neon-space-station-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/neon-space-station/aura-package/neon-space-station-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/neon-space-station/static-background-64.png`,
  },
  {
    key: "rainy-window-cafe-background",
    category: "background",
    floor: null,
    labelKo: "비 오는 날",
    price: 500,
    effectKey: "comment_reward",
    effectBps: 100,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/rainy-window-cafe/aura-package/rainy-window-cafe-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/rainy-window-cafe/aura-package/rainy-window-cafe-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/rainy-window-cafe/static-background-64.png`,
  },
  {
    key: "starry-workshop-background",
    category: "background",
    floor: null,
    labelKo: "별빛 공방",
    price: 500,
    effectKey: "assignment_reward",
    effectBps: 100,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/starry-workshop/aura-package/starry-workshop-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/starry-workshop/aura-package/starry-workshop-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/starry-workshop/static-background-64.png`,
  },
  {
    key: "sunset-lantern-sky-background",
    category: "background",
    floor: null,
    labelKo: "노을 등불",
    price: 1_000,
    effectKey: "comment_reward",
    effectBps: 300,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/sunset-lantern-sky/aura-package/sunset-lantern-sky-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/sunset-lantern-sky/aura-package/sunset-lantern-sky-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/sunset-lantern-sky/static-background-64.png`,
  },
  {
    key: "tropical-fish-ocean-background",
    category: "background",
    floor: null,
    labelKo: "열대어 파티",
    price: 1_000,
    effectKey: "walking_reward",
    effectBps: 300,
    spritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/tropical-fish-ocean/aura-package/tropical-fish-ocean-6s-64.gif`,
    mobileSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/tropical-fish-ocean/aura-package/tropical-fish-ocean-6s-128.gif`,
    staticSpritePath: `${SLIME_ASSET_ROOT}/shop/backgrounds/tropical-fish-ocean/static-background-64.png`,
  },
  {
    key: "slime-blue-trampoline",
    category: "vehicle",
    floor: null,
    labelKo: "트램펄린",
    price: SLIME_SHOP_DEFAULT_PRICE,
    vehicleStance: "grounded",
    vehicleRiseY: SLIME_VEHICLE_DEFAULT_RISE_Y,
    effectKey: "walking_reward",
    effectBps: SLIME_SHOP_LOWER_TIER_EFFECT_BPS,
    spritePath: `${SLIME_ASSET_ROOT}/shop/slime-blue-trampoline.gif`,
  },
  ...SLIME_VEHICLE_CATALOG,
  ...SLIME_DRINK_CATALOG,
  ...SLIME_BALL_CATALOG,
  ...SLIME_WEARABLE_CATALOG.map((wearable): SlimeShopItem => ({
    key: wearable.key,
    category: "wearable",
    floor: null,
    labelKo: wearable.labelKo,
    price: wearable.price,
    spritePath: slimeWearableEntry(wearable.role, wearable.option)?.sheets.idle?.url ?? "",
    wearableRole: wearable.role,
    wearableOption: wearable.option,
    effectKey: wearable.effectKey,
    effectBps: wearable.effectBps,
  })),
  {
    key: "slime-cookie",
    category: "food",
    floor: null,
    labelKo: "쿠키",
    price: SLIME_COOKIE_PRICE,
    spritePath: SLIME_SHARED_ASSETS.cookie.imageUrl,
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
const slimeBallBySlug = new Map<SlimeBallSlug, SlimeBallShopItem>(
  SLIME_BALL_CATALOG.map((item) => [item.slug, item]),
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

export type SlimeVisualItemSlot =
  | "background"
  | "floor"
  | "vehicle"
  | "prop"
  | "blush"
  | "eyewear"
  | "headwear";

/** A scene background has no floor state; legacy background floors still do. */
export function isSlimeSceneBackground(
  item: Pick<SlimeShopItem, "category" | "floor">,
): boolean {
  return item.category === "background" && item.floor === null;
}

/** Scene backgrounds, floors, and accessories occupy independent visual slots. */
export function slimeVisualItemSlot(
  item: Pick<SlimeShopItem, "category" | "floor" | "wearableRole">,
): SlimeVisualItemSlot | null {
  if (item.floor) return "floor";
  if (isSlimeSceneBackground(item)) return "background";
  // Vehicles sit above the floor instead of replacing it, so they own their own
  // slot and stay equippable alongside a background and a floor.
  if (item.category === "vehicle" || item.category === "ride") return "vehicle";
  if (item.category === "drink" || item.category === "prop") return "prop";
  if (item.category === "wearable") return item.wearableRole ?? null;
  return null;
}

/** Collapse malformed legacy arrays to one key per visual slot. Last key wins. */
export function normalizeEquippedSlimeItemKeys(itemKeys: readonly string[]): string[] {
  const slotKeys: Partial<Record<SlimeVisualItemSlot, string>> = {};
  for (const itemKey of itemKeys) {
    const item = getSlimeShopItem(itemKey);
    if (!item) continue;
    const slot = slimeVisualItemSlot(item);
    if (slot) slotKeys[slot] = item.key;
  }
  return ["background", "floor", "vehicle", "prop", "blush", "eyewear", "headwear"]
    .map((slot) => slotKeys[slot as SlimeVisualItemSlot])
    .filter((key): key is string => Boolean(key));
}

export function getSlimeBallDefinition(slug: string): SlimeBallShopItem | undefined {
  return slimeBallBySlug.get(slug as SlimeBallSlug);
}

/** Legacy rows may contain several floors; the last equipped key wins. */
export function getEquippedSlimeFloor(itemKeys: readonly string[]): SlimeFloor {
  let floor: SlimeFloor = "none";
  for (const itemKey of itemKeys) {
    const candidate = getSlimeShopItem(itemKey)?.floor;
    if (candidate) floor = candidate;
  }
  return floor;
}
