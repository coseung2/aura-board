import type { SlimeColor } from "../slime-assets";
import type { MobileSlimeHome, SlimeShopFilter } from "../slimes";
import type { SlimeWardrobeFilter as WardrobeFilter } from "../slime-shop-presentation";
import { SLIME_COLOR_LABELS } from "../slimes";
import { SLIME_COOKIE_ITEM_KEY } from "../slimes";
import { aggregateMobileSlimeBuffTotals } from "../slimes";
import { buildSlimeShopOverviewSections } from "../slime-shop-presentation";
import { groupSlimeOutfitsByRole } from "../slimes";
import { groupSlimePropsByKind } from "../slimes";
import { groupSlimeShopItemsByTier } from "../slimes";
import { mobileSlimeActiveSets } from "../slimes";
import { mobileSlimeBuffGroups } from "../slimes";
import { prioritizeEquippedSlimeItems } from "../slime-item-visibility";
import { shopFilterForItem } from "../slimes";
import { slimeShopNavItems } from "../slimes";
import { slimeWardrobeFilterForItem } from "../slime-shop-presentation";
import { slimeWardrobeItemWearerLabel } from "../slime-shop-presentation";
import { slimeWardrobeNavItems } from "../slime-shop-presentation";
import { useCallback } from "react";
import { useMemo } from "react";

type StudentSlimeDerivedStateArgs = {
  home: MobileSlimeHome | null;
  selectedColor: SlimeColor;
  wardrobeColor: SlimeColor | null;
  shopFilter: SlimeShopFilter;
  wardrobeFilter: WardrobeFilter;
  sectionParam?: string;
};

export function useStudentSlimeDerivedState({
  home,
  selectedColor,
  wardrobeColor,
  shopFilter,
  wardrobeFilter,
  sectionParam,
}: StudentSlimeDerivedStateArgs) {
  const wardrobeTargetColor = wardrobeColor ?? selectedColor;

  const wardrobeEquippedItems =
    home?.equippedItemsByColor[wardrobeTargetColor] ?? [];

  const shopNavItems = useMemo(
    () => slimeShopNavItems(home?.shopCatalog ?? []),
    [home?.shopCatalog],
  );

  const wardrobeNavItems = useMemo(
    () => slimeWardrobeNavItems(home?.shopCatalog ?? []),
    [home?.shopCatalog],
  );

  const cookieQuantity = home?.ownedItemQuantities[SLIME_COOKIE_ITEM_KEY] ?? 0;

  const visibleShopItems = useMemo(
    () =>
      home?.shopCatalog.filter((item) =>
        shopFilter === "all"
          ? item.category !== "level-up"
          : shopFilterForItem(item) === shopFilter,
      ) ?? [],
    [home, shopFilter],
  );

  const shopOverviewSections = useMemo(
    () =>
      buildSlimeShopOverviewSections(
        home?.catalog ?? [],
        home?.shopCatalog ?? [],
      ),
    [home?.catalog, home?.shopCatalog],
  );

  /** Family set bonuses are account-wide, so they are computed once per home. */
  const activeSets = useMemo(
    () => (home ? mobileSlimeActiveSets(home) : []),
    [home],
  );

  /**
   * Which other pet is wearing an item, if any.
   *
   * A piece lives in one place at a time, so equipping it here takes it off that
   * pet. Surfacing the current wearer stops that from looking like the item
   * vanished from another slime, and it matters for family sets, where the same
   * piece cannot count twice.
   */
  const wardrobeItemWearer = useCallback(
    (itemKey: string): string | null =>
      home
        ? slimeWardrobeItemWearerLabel(
            itemKey,
            wardrobeTargetColor,
            home.equippedItemsByColor,
            SLIME_COLOR_LABELS,
          )
        : null,
    [home, wardrobeTargetColor],
  );

  const visibleShopTiers = useMemo(
    () => groupSlimeShopItemsByTier(visibleShopItems),
    [visibleShopItems],
  );

  /**
   * Outfits nest one level deeper: slot sub-categories separated by a rule, and
   * price bands within each slot separated by spacing alone.
   */
  const visibleOutfitGroups = useMemo(
    () =>
      groupSlimeOutfitsByRole(visibleShopItems).map((group) => ({
        ...group,
        tiers: groupSlimeShopItemsByTier(group.items),
      })),
    [visibleShopItems],
  );

  /** Props nest the same way outfits do: sub-category, then price band. */
  const visiblePropGroups = useMemo(
    () =>
      groupSlimePropsByKind(visibleShopItems).map((group) => ({
        ...group,
        tiers: groupSlimeShopItemsByTier(group.items),
      })),
    [visibleShopItems],
  );

  /**
   * Sub-category groups for the tabs that have them, or null for the flat tabs.
   *
   * Outfits group by slot and props by kind, but both render identically, so the
   * list picks the grouping here rather than branching per tab in the markup.
   */
  const nestedShopGroups = useMemo(() => {
    if (shopFilter === "outfit") {
      return visibleOutfitGroups.map((group) => ({
        ...group,
        key: group.role,
      }));
    }
    if (shopFilter === "prop") return visiblePropGroups;
    return null;
  }, [shopFilter, visibleOutfitGroups, visiblePropGroups]);

  const wardrobeItems = useMemo(
    () =>
      home?.shopCatalog.filter(
        (item) =>
          home.ownedItemKeys.includes(item.key) &&
          item.category !== "food" &&
          item.category !== "level-up",
      ) ?? [],
    [home],
  );

  const visibleWardrobeItems = useMemo(
    () =>
      prioritizeEquippedSlimeItems(
        wardrobeItems.filter(
          (item) => slimeWardrobeFilterForItem(item) === wardrobeFilter,
        ),
        wardrobeEquippedItems,
      ),
    [wardrobeEquippedItems, wardrobeFilter, wardrobeItems],
  );

  const visibleWardrobeTitles = useMemo(() => {
    const equippedTitle = home?.equippedTitleByColor?.[wardrobeTargetColor];
    return prioritizeEquippedSlimeItems(
      home?.claimedTitles ?? [],
      equippedTitle ? [equippedTitle] : [],
    );
  }, [home?.claimedTitles, home?.equippedTitleByColor, wardrobeTargetColor]);

  const buffGroups = useMemo(
    () => (home ? mobileSlimeBuffGroups(home) : []),
    [home],
  );

  const buffGroupsByColor = useMemo(
    () => new Map(buffGroups.map((group) => [group.color, group])),
    [buffGroups],
  );

  const appliedBuffTotals = useMemo(
    () => aggregateMobileSlimeBuffTotals(buffGroups),
    [buffGroups],
  );

  const appliedGrowthSpeedBps =
    appliedBuffTotals.find((effect) => effect.effectKey === "growth_speed")
      ?.bps ?? 0;

  const section =
    sectionParam === "classroom"
      ? "classroom"
      : sectionParam === "shop"
        ? "shop"
        : "mine";
  return {
    wardrobeTargetColor,
    wardrobeEquippedItems,
    shopNavItems,
    wardrobeNavItems,
    cookieQuantity,
    visibleShopItems,
    shopOverviewSections,
    activeSets,
    wardrobeItemWearer,
    visibleShopTiers,
    visibleOutfitGroups,
    visiblePropGroups,
    nestedShopGroups,
    wardrobeItems,
    visibleWardrobeItems,
    visibleWardrobeTitles,
    buffGroups,
    buffGroupsByColor,
    appliedBuffTotals,
    appliedGrowthSpeedBps,
    section,
  } as const;
}
