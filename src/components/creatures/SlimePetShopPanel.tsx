import { useState, type RefObject } from "react";
import { ChevronRight } from "lucide-react";

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
  groupSlimeShopItemsByTier,
  shopFilterForItem,
  slimeShopNavItems,
  slimeWardrobeNavItems,
  wardrobeFilterForItem,
  type ClaimedTitle,
  type EquippedItemsByColor,
  type Notice,
  type ShopFilter,
  type WardrobeFilter,
} from "./SlimePetModel";
import { SlimeShopItemCard } from "./SlimeShopItemCard";
import { SlimeShopNavigation } from "./SlimeShopNavigation";
import { SlimeShopPanelShell } from "./SlimeShopPanelShell";
import { SlimeShopSlimeList } from "./SlimeShopSlimeList";
import { SlimeWardrobeTitleList } from "./SlimeWardrobeTitleList";

type Props = {
  presentation?: "modal" | "inline";
  catalog: SlimeDefinition[];
  /** Full shop catalog used for top-level tab availability. */
  shopCatalog: SlimeShopItem[];
  /** Items currently shown in the active tab/panel. */
  shopItems: SlimeShopItem[];
  ownedKeys: SlimeColor[];
  ownedItemKeys: string[];
  ownedItemQuantities: Record<string, number>;
  equippedItemKeys: string[];
  equippedItemsByColor: EquippedItemsByColor;
  hiddenItemsByColor?: Partial<Record<SlimeColor, string[]>>;
  claimedTitles?: ClaimedTitle[];
  equippedTitleByColor?: Partial<Record<SlimeColor, string>>;
  wardrobeColor: SlimeColor | null;
  shopFilter: ShopFilter;
  wardrobeFilter?: WardrobeFilter;
  unitLabel: string;
  busyColor: SlimeColor | null;
  busyItemKey: string | null;
  busyTitleColor?: SlimeColor | null;
  notice: Notice | null;
  cartCount?: number;
  onOpenCart?: () => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  onClose?: () => void;
  onFilterChange: (filter: ShopFilter) => void;
  onWardrobeFilterChange?: (filter: WardrobeFilter) => void;
  onPurchaseSlime: (color: SlimeColor) => void;
  onRefundSlime: (slime: SlimeDefinition) => void;
  onPurchaseItem: (item: SlimeShopItem) => void;
  onRefundItem: (item: SlimeShopItem) => void;
  onEquipItem: (
    color: SlimeColor,
    item: SlimeShopItem,
    nextEquipped: boolean,
  ) => void;
  onToggleItemVisibility?: (
    color: SlimeColor,
    item: SlimeShopItem,
    isHidden: boolean,
  ) => void;
  onEquipTitle?: (color: SlimeColor, titleKey: string | null) => void;
};

const SHOP_CAROUSEL_VISIBLE_COUNT = 5;

export function SlimePetShopPanel({
  presentation = "modal",
  catalog,
  shopCatalog,
  shopItems,
  ownedKeys,
  ownedItemKeys,
  ownedItemQuantities,
  equippedItemKeys,
  equippedItemsByColor,
  hiddenItemsByColor = {},
  claimedTitles = [],
  equippedTitleByColor = {},
  wardrobeColor,
  shopFilter,
  wardrobeFilter = "floor",
  unitLabel,
  busyColor,
  busyItemKey,
  busyTitleColor = null,
  notice,
  cartCount = 0,
  onOpenCart,
  searchQuery = "",
  onSearchQueryChange,
  closeButtonRef,
  onClose,
  onFilterChange,
  onWardrobeFilterChange,
  onPurchaseSlime,
  onRefundSlime,
  onPurchaseItem,
  onRefundItem,
  onEquipItem,
  onToggleItemVisibility,
  onEquipTitle,
}: Props) {
  const wardrobeName =
    catalog.find((slime) => slime.color === wardrobeColor)?.nameKo ?? "슬라임";
  const [categoryPages, setCategoryPages] = useState<Record<string, number>>({});
  const isWardrobe = Boolean(wardrobeColor);
  const navigationItems = isWardrobe
    ? slimeWardrobeNavItems(shopCatalog)
    : slimeShopNavItems(shopCatalog);
  const activeFilter = isWardrobe ? wardrobeFilter : shopFilter;
  const renderShopItem = (item: SlimeShopItem) => (
    <SlimeShopItemCard
      key={item.key}
      item={item}
      wardrobe={isWardrobe}
      wardrobeColor={wardrobeColor}
      wardrobeFilter={wardrobeFilter}
      unitLabel={unitLabel}
      ownedItemKeys={ownedItemKeys}
      ownedItemQuantities={ownedItemQuantities}
      equippedItemKeys={equippedItemKeys}
      equippedItemsByColor={equippedItemsByColor}
      hiddenItemsByColor={hiddenItemsByColor}
      busyItemKey={busyItemKey}
      onPurchaseItem={onPurchaseItem}
      onEquipItem={onEquipItem}
      onToggleItemVisibility={onToggleItemVisibility}
    />
  );

  const renderTitleList = () =>
    wardrobeColor ? (
      <SlimeWardrobeTitleList
        wardrobeColor={wardrobeColor}
        claimedTitles={claimedTitles}
        equippedTitleKey={equippedTitleByColor[wardrobeColor] ?? null}
        busyTitleColor={busyTitleColor}
        busyItemKey={busyItemKey}
        onEquipTitle={onEquipTitle}
      />
    ) : null;

  const renderSlimeList = (sourceCatalog = catalog, listKey?: string) => (
    <SlimeShopSlimeList
      key={listKey}
      catalog={sourceCatalog}
      listKey={listKey}
      searchQuery={searchQuery}
      ownedKeys={ownedKeys}
      busyColor={busyColor}
      unitLabel={unitLabel}
      onPurchaseSlime={onPurchaseSlime}
    />
  );

  const renderWardrobeItems = (
    items: readonly SlimeShopItem[],
    label: string,
  ) => {
    if (items.length === 0) {
      return (
        <ul className={styles.wardrobeList} aria-label={label}>
          <li className={styles.emptyState}>
            이 카테고리에 보유한 아이템이 없어요.
          </li>
        </ul>
      );
    }
    return (
      <ul className={styles.wardrobeList} aria-label={label}>
        {items.map(renderShopItem)}
      </ul>
    );
  };

  const renderTieredItems = (items: readonly SlimeShopItem[], label: string) => {
    if (items.length === 0) {
      return (
        <ul className={styles.shopList} aria-label={label}>
          <li className={styles.emptyState}>이 분류에는 상품이 없어요.</li>
        </ul>
      );
    }
    const tiers = groupSlimeShopItemsByTier(items);
    return (
      <div className={styles.shopGroups}>
        {tiers.map((tier) => (
          <section
            key={`${label}-${tier.price}-${tier.label || "default"}`}
            className={styles.shopGroup}
            aria-label={tier.label || label}
          >
            {tier.label ? (
              <h3 className={styles.shopTierHeading}>{tier.label}</h3>
            ) : null}
            <ul className={styles.shopList} aria-label={label}>
              {tier.items.map(renderShopItem)}
            </ul>
          </section>
        ))}
      </div>
    );
  };

  const renderFlatItems = (items: readonly SlimeShopItem[], label: string, listKey?: string) => (
    <ul
      key={listKey}
      className={[styles.shopList, listKey ? styles.shopCarouselPage : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
    >
      {items.map(renderShopItem)}
    </ul>
  );

  const advanceCategoryPage = (key: string, itemCount: number, direction = 1) => {
    const pageCount = Math.max(
      1,
      Math.ceil(itemCount / SHOP_CAROUSEL_VISIBLE_COUNT),
    );
    setCategoryPages((current) => ({
      ...current,
      [key]: Math.min(
        pageCount - 1,
        Math.max(0, (current[key] ?? 0) + direction),
      ),
    }));
  };

  const popularCatalog = [...catalog].sort(
    (left, right) => (right.purchaseCount ?? 0) - (left.purchaseCount ?? 0),
  );

  const renderGroupedItems = () => {
    if (isWardrobe && wardrobeFilter === "title") return renderTitleList();

    if (!isWardrobe && shopFilter === "character") return renderSlimeList();

    if (!isWardrobe && shopFilter === "all") {
      const categoryItems = navigationItems.filter(({ key }) => key !== "all");
      const characterPage = categoryPages.character ?? 0;
      const characterMaxPage = Math.max(
        0,
        Math.ceil(popularCatalog.length / SHOP_CAROUSEL_VISIBLE_COUNT) - 1,
      );
      return (
        <div className={styles.shopAllCategories}>
          <section className={styles.shopAllCategory} aria-labelledby="shop-all-character">
            <div className={styles.shopAllCategoryHeader}>
              <h3 id="shop-all-character" className={styles.shopAllCategoryHeading}>
                캐릭터
              </h3>
              {popularCatalog.length > 5 ? (
                <button
                  type="button"
                  className={styles.shopAllCategoryMore}
                  onClick={() => onFilterChange("character")}
                >
                  더보기
                  <ChevronRight size={16} strokeWidth={1.6} aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <div className={styles.shopCarouselRow}>
              {popularCatalog.length > 5 ? (
                <>
                  {characterPage > 0 ? (
                    <button type="button" className={styles.shopCarouselArrow} aria-label="캐릭터 이전 상품 보기" onClick={() => advanceCategoryPage("character", popularCatalog.length, -1)}>
                      <ChevronRight size={22} strokeWidth={1.6} aria-hidden="true" className={styles.shopCarouselArrowPrevious} />
                    </button>
                  ) : null}
                </>
              ) : null}
              {renderSlimeList(
                popularCatalog.slice(
                  (categoryPages.character ?? 0) * SHOP_CAROUSEL_VISIBLE_COUNT,
                  (categoryPages.character ?? 0) * SHOP_CAROUSEL_VISIBLE_COUNT + SHOP_CAROUSEL_VISIBLE_COUNT,
                ),
                `character-${categoryPages.character ?? 0}`,
              )}
              {characterPage < characterMaxPage ? (
                <button type="button" className={styles.shopCarouselArrow} aria-label="캐릭터 다음 상품 보기" onClick={() => advanceCategoryPage("character", popularCatalog.length)}>
                  <ChevronRight size={22} strokeWidth={1.6} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </section>
          {categoryItems
            .filter(({ key }) => key !== "character")
            .map(({ key, label }) => {
              const items = shopItems
                .filter((item) => shopFilterForItem(item) === key)
                .sort((left, right) => (right.purchaseCount ?? 0) - (left.purchaseCount ?? 0));
              if (items.length === 0) return null;
              const page = categoryPages[key] ?? 0;
              const maxPage = Math.max(
                0,
                Math.ceil(items.length / SHOP_CAROUSEL_VISIBLE_COUNT) - 1,
              );
              const visibleItems = items.slice(
                page * SHOP_CAROUSEL_VISIBLE_COUNT,
                page * SHOP_CAROUSEL_VISIBLE_COUNT + SHOP_CAROUSEL_VISIBLE_COUNT,
              );
              return (
                <section
                  key={key}
                  className={styles.shopAllCategory}
                  aria-labelledby={`shop-all-${key}`}
                >
                  <div className={styles.shopAllCategoryHeader}>
                    <h3 id={`shop-all-${key}`} className={styles.shopAllCategoryHeading}>
                      {label}
                    </h3>
                    {page < maxPage ? (
                      <button
                        type="button"
                        className={styles.shopAllCategoryMore}
                        onClick={() => onFilterChange(key as ShopFilter)}
                      >
                        더보기
                        <ChevronRight size={16} strokeWidth={1.6} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                  <div className={styles.shopCarouselRow}>
                    {items.length > 5 ? (
                      <>
                        {page > 0 ? (
                          <button type="button" className={styles.shopCarouselArrow} aria-label={`${label} 이전 상품 보기`} onClick={() => advanceCategoryPage(key, items.length, -1)}>
                            <ChevronRight size={22} strokeWidth={1.6} aria-hidden="true" className={styles.shopCarouselArrowPrevious} />
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {renderFlatItems(visibleItems, `${label} 상품 목록`, `${key}-${page}`)}
                    {items.length > 5 ? (
                      <button type="button" className={styles.shopCarouselArrow} aria-label={`${label} 다음 상품 보기`} onClick={() => advanceCategoryPage(key, items.length)}>
                        <ChevronRight size={22} strokeWidth={1.6} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </section>
              );
            })}
        </div>
      );
    }

    if (isWardrobe) {
      const equippedKeys = wardrobeColor
        ? (equippedItemsByColor[wardrobeColor] ?? [])
        : [];
      const sourceItems = prioritizeEquippedSlimeItems(
        shopCatalog.filter(
          (item) =>
            ownedItemKeys.includes(item.key) &&
            (item.category as string) !== "food" &&
            (item.category as string) !== "level-up" &&
            wardrobeFilterForItem(item) === wardrobeFilter,
        ),
        equippedKeys,
      );
      return renderWardrobeItems(sourceItems, "보유 아이템 목록");
    }

    const sourceItems = shopItems.filter(() => true);

    if (shopFilter === "prop") {
      const groups = groupSlimePropsByKind(sourceItems).filter(
        (group) => group.key !== "ride",
      );
      if (groups.length === 0) {
        return (
          <ul className={styles.shopList} aria-label="소품 상품 목록">
            <li className={styles.emptyState}>이 분류에는 상품이 없어요.</li>
          </ul>
        );
      }
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
              {renderTieredItems(group.items, `${group.label} 상품 목록`)}
            </section>
          ))}
        </div>
      );
    }

    if (shopFilter === "outfit") {
      const groups = groupSlimeOutfitsByRole(sourceItems);
      if (groups.length === 0) {
        return (
          <ul className={styles.shopList} aria-label="아웃핏 상품 목록">
            <li className={styles.emptyState}>이 분류에는 상품이 없어요.</li>
          </ul>
        );
      }
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
              {renderTieredItems(group.items, `${group.label} 상품 목록`)}
            </section>
          ))}
        </div>
      );
    }

    return renderTieredItems(sourceItems, "상점 상품 목록");
  };

  return (
    <SlimeShopPanelShell
      presentation={presentation}
      wardrobe={isWardrobe}
      wardrobeName={wardrobeName}
      closeButtonRef={closeButtonRef}
      onClose={onClose}
    >
      <SlimeShopNavigation
        items={navigationItems}
        activeKey={activeFilter}
        wardrobe={isWardrobe}
        catalog={catalog}
        shopCatalog={shopCatalog}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        cartCount={cartCount}
        onOpenCart={onOpenCart}
        onSelect={(key) => {
          if (isWardrobe) {
            onWardrobeFilterChange?.(key as WardrobeFilter);
          } else {
            onFilterChange(key as ShopFilter);
          }
        }}
      />
      <div
        id="slime-shop-panel"
        role="tabpanel"
        aria-labelledby={`slime-shop-tab-${activeFilter}`}
        tabIndex={0}
        className={styles.shopPanel}
      >
        {renderGroupedItems()}
      </div>
    </SlimeShopPanelShell>
  );
}

/** @deprecated Prefer SlimePetShopPanel. Kept for local import compatibility. */
export const SlimePetShopDrawer = SlimePetShopPanel;
