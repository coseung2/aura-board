import type { SlimeColor } from "./slime-assets";
import type { MobileSlimeHome } from "./slime-normalization";
import { slimeBuffBpsForStage, stageForColor } from "./slime-domain-helpers";
export type MobileSlimeEffect = {
  source: string;
  key: string;
  label: string;
  effectKey: string;
  bps: number;
};

export type MobileSlimeBuffGroup = {
  color: SlimeColor;
  label: string;
  entries: MobileSlimeEffect[];
  totals: Array<Pick<MobileSlimeEffect, "effectKey" | "bps">>;
};

export const MOBILE_SLIME_EFFECT_KEYS = [
  "growth_speed",
  "reading_reward",
  "walking_reward",
  "assignment_reward",
  "comment_reward",
] as const;

export type MobileSlimeEffectKey = (typeof MOBILE_SLIME_EFFECT_KEYS)[number];

/**
 * Resolve the buffs worn by each owned pet, then aggregate duplicate effect
 * types within that pet. The detailed entries feed the arrow popover while
 * totals feed the compact summary below the pet grid.
 */
export function mobileSlimeBuffGroups(
  home: MobileSlimeHome,
): MobileSlimeBuffGroup[] {
  const shopItemsByKey = new Map(
    home.shopCatalog.map((item) => [item.key, item]),
  );
  const claimedTitlesByKey = new Map(
    home.claimedTitles.map((title) => [title.key, title]),
  );

  return home.ownedColors.flatMap((itemColor) => {
    const slime = home.catalog.find((entry) => entry.color === itemColor);
    if (!slime) return [];

    const entries: MobileSlimeEffect[] = [];
    const baseBps = slimeBuffBpsForStage(
      slime.baseBuffBps,
      stageForColor(home, itemColor),
    );
    if (slime.effectKey && baseBps > 0) {
      entries.push({
        source: "slime",
        key: slime.key,
        label: "펫 기본 효과",
        effectKey: slime.effectKey,
        bps: baseBps,
      });
    }

    for (const itemKey of home.equippedItemsByColor[itemColor] ?? []) {
      const item = shopItemsByKey.get(itemKey);
      if (!item?.effectKey || !item.effectBps) continue;
      entries.push({
        source:
          item.category === "background" && item.floor === null
            ? "background"
            : "item",
        key: item.key,
        label: item.labelKo,
        effectKey: item.effectKey,
        bps: item.effectBps,
      });
    }

    const titleKey = home.equippedTitleByColor[itemColor];
    const title = titleKey ? claimedTitlesByKey.get(titleKey) : undefined;
    if (title?.effectKey && title.buffBps > 0) {
      entries.push({
        source: "title",
        key: title.key,
        label: title.label,
        effectKey: title.effectKey,
        bps: title.buffBps,
      });
    }

    const totalsByEffect = new Map<string, number>();
    for (const entry of entries) {
      totalsByEffect.set(
        entry.effectKey,
        (totalsByEffect.get(entry.effectKey) ?? 0) + entry.bps,
      );
    }

    return [
      {
        color: itemColor,
        label: slime.nameKo,
        entries,
        totals: Array.from(totalsByEffect, ([effectKey, bps]) => ({
          effectKey,
          bps,
        })),
      },
    ];
  });
}

/**
 * Outfit family sets, kept in step with the web catalog.
 *
 * Membership is by shop key so a rename of a display label cannot break a set.
 */
const WEARABLE_SETS = [
  {
    key: "beanie-collection",
    labelKo: "비니 컬렉션",
    itemKeys: [
      "slime-headwear-beige-beanie",
      "slime-headwear-brown-beanie",
      "slime-headwear-charcoal-beanie",
      "slime-headwear-ivory-beanie",
    ],
    effectKey: "assignment_reward",
    bps: 200,
  },
  {
    key: "goggles-collection",
    labelKo: "고글 컬렉션",
    itemKeys: [
      "slime-eyewear-black-goggles",
      "slime-eyewear-copper-goggles",
      "slime-eyewear-gold-goggles",
      "slime-eyewear-silver-goggles",
    ],
    effectKey: "reading_reward",
    bps: 200,
  },
  {
    key: "sunglasses-pair",
    labelKo: "선글라스 세트",
    itemKeys: [
      "slime-eyewear-black-sunglasses",
      "slime-eyewear-red-sunglasses",
    ],
    effectKey: "reading_reward",
    bps: 100,
  },
  {
    key: "blush-pair",
    labelKo: "볼터치 세트",
    itemKeys: ["slime-blush-peach-brush-blush", "slime-blush-rose-brush-blush"],
    effectKey: "comment_reward",
    bps: 100,
  },
] as const;

export type MobileSlimeActiveSet = Readonly<{
  key: string;
  label: string;
  effectKey: string;
  bps: number;
}>;

/**
 * Sets whose every piece is currently worn, counted across the whole collection.
 *
 * A single slime can only wear one option per slot, so a family is completed by
 * spreading it over several pets: four beanies on four slimes activates the beanie
 * collection. That is why this reads every pet's equipped list rather than one
 * pet's, and why the grid shows the result in one shared cell.
 *
 * Owning a piece is not enough. Leaving it in the wardrobe grants nothing, so the
 * bonus rewards actually dressing the collection.
 */
export function mobileSlimeActiveSets(
  home: MobileSlimeHome,
): readonly MobileSlimeActiveSet[] {
  const worn = new Set<string>();
  for (const itemKeys of Object.values(home.equippedItemsByColor ?? {})) {
    for (const itemKey of itemKeys ?? []) worn.add(itemKey);
  }
  return WEARABLE_SETS.filter((set) =>
    set.itemKeys.every((key) => worn.has(key)),
  ).map((set) => ({
    key: set.key,
    label: set.labelKo,
    effectKey: set.effectKey,
    bps: set.bps,
  }));
}

/** Aggregate every pet's active buffs into the five product effect areas. */
export function aggregateMobileSlimeBuffTotals(
  groups: readonly MobileSlimeBuffGroup[],
): Array<{ effectKey: MobileSlimeEffectKey; bps: number }> {
  const totals = new Map<MobileSlimeEffectKey, number>(
    MOBILE_SLIME_EFFECT_KEYS.map((effectKey) => [effectKey, 0]),
  );
  for (const group of groups) {
    for (const effect of group.totals) {
      if (
        !(MOBILE_SLIME_EFFECT_KEYS as readonly string[]).includes(
          effect.effectKey,
        )
      )
        continue;
      const effectKey = effect.effectKey as MobileSlimeEffectKey;
      totals.set(effectKey, (totals.get(effectKey) ?? 0) + effect.bps);
    }
  }
  return MOBILE_SLIME_EFFECT_KEYS.map((effectKey) => ({
    effectKey,
    bps: totals.get(effectKey) ?? 0,
  }));
}
