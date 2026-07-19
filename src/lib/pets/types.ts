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

export const SLIME_SHOP_CATEGORIES = ["background", "ride", "drink"] as const;

export type SlimeShopCategory = (typeof SLIME_SHOP_CATEGORIES)[number];

export type SlimeShopItem = {
  readonly key: string;
  readonly category: SlimeShopCategory;
  readonly labelKo: string;
  readonly price: number;
  readonly spritePath: string;
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
  readonly source: "slime" | "set";
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
