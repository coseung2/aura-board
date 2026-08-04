import { prioritizeEquippedSlimeItems } from "@/lib/pets/item-visibility";
import type {
  SlimeColor,
  SlimeDefinition,
  SlimeShopItem,
} from "@/lib/pets/types";

import styles from "./SlimePetPage.module.css";
import {
  groupSlimeOutfitsByRole,
  groupSlimePropsByKind,
  wardrobeFilterForItem,
  type ClaimedTitle,
  type EquippedItemsByColor,
  type ShopFilter,
  type WardrobeFilter,
} from "./SlimePetModel";
import { SlimeShopAllCategories } from "./SlimeShopAllCategories";
import {
  SlimeShopTieredItemList,
  SlimeShopWardrobeItemList,
  type SlimeShopItemCardContext,
} from "./SlimeShopItemLists";
import { SlimeShopSlimeList } from "./SlimeShopSlimeList";
import { SlimeWardrobeAllCategories } from "./SlimeWardrobeAllCategories";
import { SlimeWardrobeTitleList } from "./SlimeWardrobeTitleList";

type ShopNavigationItem = {
  key: string;
  label: string;
};

type SlimeShopCatalogContentProps = {
  catalog: SlimeDefinition[];
  shopCatalog: SlimeShopItem[];
  shopItems: SlimeShopItem[];
  navigationItems: readonly ShopNavigationItem[];
  ownedKeys: SlimeColor[];
  ownedItemKeys: string[];
  equippedItemsByColor: EquippedItemsByColor;
  growthByColor: Partial<Record<SlimeColor, { stage?: number }>>;
  claimedTitles: ClaimedTitle[];
  equippedTitleByColor: Partial<Record<SlimeColor, string>>;
  wardrobe: boolean;
  wardrobeColor: SlimeColor | null;
  shopFilter: ShopFilter;
  wardrobeFilter: WardrobeFilter;
  searchQuery: string;
  unitLabel: string;
  busyColor: SlimeColor | null;
  busyItemKey: string | null;
  busyTitleColor: SlimeColor | null;
  cardContext: SlimeShopItemCardContext;
  onFilterChange: (filter: ShopFilter) => void;
  onWardrobeFilterChange?: (filter: WardrobeFilter) => void;
  onPurchaseSlime: (color: SlimeColor) => void;
  onEquipTitle?: (color: SlimeColor, titleKey: string | null) => void;
};

/** Chooses the active catalog or wardrobe content renderer. */
export function SlimeShopCatalogContent({
  catalog,
  shopCatalog,
  shopItems,
  navigationItems,
  ownedKeys,
  ownedItemKeys,
  equippedItemsByColor,
  growthByColor,
  claimedTitles,
  equippedTitleByColor,
  wardrobe,
  wardrobeColor,
  shopFilter,
  wardrobeFilter,
  searchQuery,
  unitLabel,
  busyColor,
  busyItemKey,
  busyTitleColor,
  cardContext,
  onFilterChange,
  onWardrobeFilterChange,
  onPurchaseSlime,
  onEquipTitle,
}: SlimeShopCatalogContentProps) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

  if (wardrobe && wardrobeFilter === "all") {
    if (!wardrobeColor) return null;
    const items = shopCatalog.filter(
      (item) =>
        ownedItemKeys.includes(item.key) &&
        (item.category as string) !== "food" &&
        (item.category as string) !== "level-up",
    );
    return (
      <SlimeWardrobeAllCategories
        items={items}
        navigationItems={navigationItems}
        searchQuery={searchQuery}
        wardrobeColor={wardrobeColor}
        equippedItemsByColor={equippedItemsByColor}
        cardContext={cardContext}
        onFilterChange={(filter) => onWardrobeFilterChange?.(filter)}
      />
    );
  }

  if (wardrobe && wardrobeFilter === "title") {
    const visibleTitles = claimedTitles.filter(
      (title) =>
        !normalizedQuery ||
        title.label.toLocaleLowerCase().includes(normalizedQuery),
    );
    return wardrobeColor ? (
      <SlimeWardrobeTitleList
        wardrobeColor={wardrobeColor}
        claimedTitles={visibleTitles}
        equippedTitleKey={equippedTitleByColor[wardrobeColor] ?? null}
        busyTitleColor={busyTitleColor}
        busyItemKey={busyItemKey}
        onEquipTitle={onEquipTitle}
      />
    ) : null;
  }

  if (!wardrobe && shopFilter === "character") {
    return (
      <SlimeShopSlimeList
        catalog={catalog}
        searchQuery={searchQuery}
        ownedKeys={ownedKeys}
        growthByColor={growthByColor}
        busyColor={busyColor}
        unitLabel={unitLabel}
        onPurchaseSlime={onPurchaseSlime}
      />
    );
  }

  if (!wardrobe && shopFilter === "all") {
    return (
      <SlimeShopAllCategories
        catalog={catalog}
        shopItems={shopItems}
        navigationItems={navigationItems}
        searchQuery={searchQuery}
        ownedKeys={ownedKeys}
        growthByColor={growthByColor}
        busyColor={busyColor}
        unitLabel={unitLabel}
        cardContext={cardContext}
        onFilterChange={onFilterChange}
        onPurchaseSlime={onPurchaseSlime}
      />
    );
  }

  if (wardrobe) {
    const equippedKeys = wardrobeColor
      ? (equippedItemsByColor[wardrobeColor] ?? [])
      : [];
    const items = prioritizeEquippedSlimeItems(
      shopCatalog.filter(
        (item) =>
          ownedItemKeys.includes(item.key) &&
          (item.category as string) !== "food" &&
          (item.category as string) !== "level-up" &&
          wardrobeFilterForItem(item) === wardrobeFilter &&
          (!normalizedQuery ||
            item.labelKo.toLocaleLowerCase().includes(normalizedQuery)),
      ),
      equippedKeys,
    );
    return (
      <SlimeShopWardrobeItemList
        items={items}
        label="보유 아이템 목록"
        cardContext={cardContext}
      />
    );
  }

  if (shopFilter === "prop") {
    const groups = groupSlimePropsByKind(shopItems).filter(
      (group) => group.key !== "ride",
    );
    if (groups.length === 0) return <EmptyShopList label="소품 상품 목록" />;
    return (
      <div className={styles.shopGroups}>
        {groups.map((group) => (
          <section
            key={group.key}
            className={`${styles.shopGroup} ${styles.shopSubcategoryGroup}`.trim()}
            aria-labelledby={`slime-shop-prop-${group.key}`}
          >
            <h3
              id={`slime-shop-prop-${group.key}`}
              className={styles.shopSubcategoryHeading}
            >
              {group.label}
            </h3>
            <SlimeShopTieredItemList
              items={group.items}
              label={`${group.label} 상품 목록`}
              cardContext={cardContext}
            />
          </section>
        ))}
      </div>
    );
  }

  if (shopFilter === "outfit") {
    const groups = groupSlimeOutfitsByRole(shopItems);
    if (groups.length === 0) return <EmptyShopList label="아웃핏 상품 목록" />;
    return (
      <div className={styles.shopGroups}>
        {groups.map((group) => (
          <section
            key={group.role}
            className={`${styles.shopGroup} ${styles.shopSubcategoryGroup}`.trim()}
            aria-labelledby={`slime-shop-outfit-${group.role}`}
          >
            <h3
              id={`slime-shop-outfit-${group.role}`}
              className={styles.shopSubcategoryHeading}
            >
              {group.label}
            </h3>
            <SlimeShopTieredItemList
              items={group.items}
              label={`${group.label} 상품 목록`}
              cardContext={cardContext}
            />
          </section>
        ))}
      </div>
    );
  }

  return (
    <SlimeShopTieredItemList
      items={shopItems}
      label="상점 상품 목록"
      cardContext={cardContext}
    />
  );
}

function EmptyShopList({ label }: { label: string }) {
  return (
    <ul className={styles.shopList} aria-label={label}>
      <li className={styles.emptyState}>이 분류에는 상품이 없어요.</li>
    </ul>
  );
}
