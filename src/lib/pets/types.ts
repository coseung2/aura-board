/**
 * Client-safe slime catalog contract. Ownership and wallet mutations remain
 * server-side; basis points keep percentage calculations exact.
 */
export const SLIME_COLORS = [
  "blue",
  "green",
  "yellow",
  "purple",
  "red",
] as const;

export type SlimeColor = (typeof SLIME_COLORS)[number];

/** Ball props imported from SlimeAssets/props/ball. */
export const SLIME_BALL_SLUGS = [
  "american-football",
  "baseball",
  "basketball",
  "black-ball",
  "dark-blue-ball",
  "soccer-ball",
  "tennis-ball",
] as const;

export type SlimeBallSlug = (typeof SLIME_BALL_SLUGS)[number];

export const SLIME_FLOORS = [
  "none",
  "grass-floor",
  "crystal-cave-floor",
  "moonlit-marble-floor",
  "royal-garden-floor",
  "celestial-gold-floor",
  "snow-ground-floor",
  "ancient-brick-floor",
  "cherry-stone-floor",
  "sand-trail-floor",
  "forest-soil-floor",
  "stone-floor",
] as const;

export type SlimeFloor = (typeof SLIME_FLOORS)[number];

/**
 * How a vehicle meets the scene.
 *
 * `grounded` rests its own base on the static floor surface, so the slime only
 * rises by the seat height. `floating` never touches the floor, so its rise is
 * large enough to need the taller overlay canvas. Vehicles never replace the
 * floor: a player who wants water under a tube buys the matching background.
 */
export const SLIME_VEHICLE_STANCES = ["grounded", "floating"] as const;

export type SlimeVehicleStance = (typeof SLIME_VEHICLE_STANCES)[number];

export const SLIME_EVOLUTIONS = [
  "base",
  "gold-crown-red-gem",
  "silver-crown-blue-gem",
] as const;

export type SlimeEvolution = (typeof SLIME_EVOLUTIONS)[number];

export const SLIME_EFFECT_KEYS = [
  "growth_speed",
  "reading_reward",
  "walking_reward",
  "assignment_reward",
  "comment_reward",
] as const;

export type SlimeEffectKey = (typeof SLIME_EFFECT_KEYS)[number];

export type SlimeDefinition = {
  readonly key: SlimeColor;
  readonly color: SlimeColor;
  readonly nameKo: string;
  readonly effectKey: SlimeEffectKey;
  readonly baseBuffBps: number;
  readonly price: number;
  readonly spritePath: string;
};

export const SLIME_SHOP_CATEGORIES = [
  "background",
  "ride",
  "vehicle",
  "drink",
  "food",
  "prop",
  "wearable",
] as const;

export type SlimeShopCategory = (typeof SLIME_SHOP_CATEGORIES)[number];

export type SlimeShopItem = {
  readonly key: string;
  readonly category: SlimeShopCategory;
  /** Semantic floor state; null means the item is not a floor. */
  readonly floor: Exclude<SlimeFloor, "none"> | null;
  readonly labelKo: string;
  readonly price: number;
  readonly spritePath: string;
  readonly mobileSpritePath?: string;
  readonly staticSpritePath?: string;
  /** Variant family used to resolve the matching per-slime animation. */
  readonly animationKey?: string;
  /** Slime colour chosen to keep the shop animation legible. */
  readonly previewColor?: SlimeColor;
  /** Imported anchor-overlay slot and option for wearable shop items. */
  readonly wearableRole?: "blush" | "eyewear" | "headwear";
  readonly wearableOption?: string;
  /** Vehicle stance; present only for `vehicle` shop items. */
  readonly vehicleStance?: SlimeVehicleStance;
  /**
   * Pixels the slime is lifted so it reads as seated in the vehicle. Measured
   * against the 64px character viewport, matching `slimeFootY`.
   *
   * Fixed on purpose. A per-frame offset would stack on the slime's own idle
   * squash and double the amplitude, which reads as hovering rather than riding.
   */
  readonly vehicleRiseY?: number;
  /**
   * Vehicle parts that stay planted while the body moves, such as wheels. Drawn
   * behind the character so the body layer can overlap them.
   */
  readonly vehicleGroundedSpritePath?: string;
  /** Frames in the vehicle sheet. Omitted means a single static image. */
  readonly vehicleFrameCount?: number;
  /** Frames in the grounded-part sheet, such as a wheel rotation. */
  readonly vehicleGroundedFrameCount?: number;
  /**
   * Fixed frame duration for the grounded part, in milliseconds. A rotation runs
   * at a constant rate, unlike the body's variable idle timing.
   */
  readonly vehicleGroundedFrameDurationMs?: number;
  /** Height of the vehicle canvas; taller than the viewport when art needs headroom. */
  readonly vehicleCanvasHeight?: number;
  /** Where the character sits inside a taller vehicle canvas. */
  readonly vehicleCharacterOffsetY?: number;
  /** Per-frame vertical bob authored into the vehicle. The rider follows it. */
  readonly vehicleBobY?: readonly number[];
  /** Animated vehicle sheet; `spritePath` stays the still shop image. */
  readonly vehicleSheetPath?: string;
  readonly effectKey?: SlimeEffectKey;
  readonly effectBps?: number;
};

export type SlimeBallShopItem = SlimeShopItem & {
  readonly slug: SlimeBallSlug;
};

export type SlimeAccessoryDefinition = {
  readonly key: string;
  readonly labelKo: string;
  readonly setKey: string;
  readonly slot: "head" | "neck" | "hand";
};

export type SlimeSetDefinition = {
  readonly key: string;
  readonly labelKo: string;
  readonly requiredAccessoryKeys: readonly string[];
  readonly effectKey: SlimeEffectKey;
  readonly effectBps: number;
};

export type SlimeBuffBreakdownItem = {
  readonly source: "slime" | "set" | "background" | "item";
  readonly key: string;
  readonly label: string;
  readonly effectKey: SlimeEffectKey;
  readonly bps: number;
};

export type SlimeEffectsPayload = {
  readonly capBps: number;
  readonly totals: Readonly<Record<SlimeEffectKey, number>>;
  readonly uncappedTotals: Readonly<Record<SlimeEffectKey, number>>;
  readonly totalBps: number;
  readonly activeSetKeys: readonly string[];
  readonly breakdown: readonly SlimeBuffBreakdownItem[];
};
