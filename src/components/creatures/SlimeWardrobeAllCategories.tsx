"use client";

import { useState } from "react";

import { prioritizeEquippedSlimeItems } from "@/lib/pets/item-visibility";
import type { SlimeColor, SlimeShopItem } from "@/lib/pets/types";

import { styles } from "./SlimePetPage.styles";
import {
  wardrobeFilterForItem,
  type EquippedItemsByColor,
  type WardrobeFilter,
} from "./SlimePetModel";
import {
  CarouselArrow,
  CategoryHeader,
  SHOP_CAROUSEL_VISIBLE_COUNT,
} from "./SlimeShopAllCategories";
import {
  SlimeShopFlatItemList,
  type SlimeShopItemCardContext,
} from "./SlimeShopItemLists";

type WardrobeNavigationItem = {
  key: string;
  label: string;
};

type SlimeWardrobeAllCategoriesProps = {
  items: readonly SlimeShopItem[];
  navigationItems: readonly WardrobeNavigationItem[];
  searchQuery: string;
  wardrobeColor: SlimeColor;
  equippedItemsByColor: EquippedItemsByColor;
  cardContext: SlimeShopItemCardContext;
  onFilterChange: (filter: WardrobeFilter) => void;
};

/** Owned-item overview using the exact shop category carousel presentation. */
export function SlimeWardrobeAllCategories({
  items,
  navigationItems,
  searchQuery,
  wardrobeColor,
  equippedItemsByColor,
  cardContext,
  onFilterChange,
}: SlimeWardrobeAllCategoriesProps) {
  const [categoryPages, setCategoryPages] = useState<Record<string, number>>({});
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const equippedKeys = equippedItemsByColor[wardrobeColor] ?? [];
  const visibleItems = prioritizeEquippedSlimeItems(
    items
      .filter(
        (item) =>
          !normalizedQuery ||
          item.labelKo.toLocaleLowerCase().includes(normalizedQuery),
      )
      .sort(
        (left, right) =>
          (right.purchaseCount ?? 0) - (left.purchaseCount ?? 0),
      ),
    equippedKeys,
  );

  const advanceCategoryPage = (
    key: string,
    itemCount: number,
    direction = 1,
  ) => {
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

  const itemSections = navigationItems.filter(
    ({ key }) => key !== "all" && key !== "title",
  );
  const hasVisibleContent = itemSections.some(({ key }) =>
    visibleItems.some((item) => wardrobeFilterForItem(item) === key),
  );

  if (!hasVisibleContent) {
    return (
      <ul className={styles.shopList} aria-label="보유 아이템 전체 목록">
        <li className={styles.emptyState}>
          {normalizedQuery
            ? "검색 결과가 없어요."
            : "꾸밀 수 있는 보유 아이템이 없어요."}
        </li>
      </ul>
    );
  }

  return (
    <div className={styles.shopAllCategories}>
      {itemSections.map(({ key, label }) => {
        const categoryItems = visibleItems.filter(
          (item) => wardrobeFilterForItem(item) === key,
        );
        if (categoryItems.length === 0) return null;

        const page = categoryPages[key] ?? 0;
        const maxPage = Math.max(
          0,
          Math.ceil(categoryItems.length / SHOP_CAROUSEL_VISIBLE_COUNT) - 1,
        );
        const pageItems = categoryItems.slice(
          page * SHOP_CAROUSEL_VISIBLE_COUNT,
          page * SHOP_CAROUSEL_VISIBLE_COUNT + SHOP_CAROUSEL_VISIBLE_COUNT,
        );

        return (
          <section
            key={key}
            className={styles.shopAllCategory}
            aria-labelledby={`wardrobe-all-${key}`}
          >
            <CategoryHeader
              id={`wardrobe-all-${key}`}
              label={label}
              showMore={categoryItems.length > SHOP_CAROUSEL_VISIBLE_COUNT}
              onMore={() => onFilterChange(key as WardrobeFilter)}
            />
            <div className={styles.shopCarouselRow}>
              {page > 0 ? (
                <CarouselArrow
                  label={`${label} 이전 아이템 보기`}
                  previous
                  onClick={() =>
                    advanceCategoryPage(key, categoryItems.length, -1)
                  }
                />
              ) : null}
              <SlimeShopFlatItemList
                items={pageItems}
                label={`${label} 보유 아이템 목록`}
                listKey={`wardrobe-${key}-${page}`}
                cardContext={cardContext}
              />
              {page < maxPage ? (
                <CarouselArrow
                  label={`${label} 다음 아이템 보기`}
                  onClick={() => advanceCategoryPage(key, categoryItems.length)}
                />
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
