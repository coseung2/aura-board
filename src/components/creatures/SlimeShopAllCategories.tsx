"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import type {
  SlimeColor,
  SlimeDefinition,
  SlimeShopItem,
} from "@/lib/pets/types";

import styles from "./SlimePetPage.module.css";
import { shopFilterForItem, type ShopFilter } from "./SlimePetModel";
import { SlimeShopFlatItemList, type SlimeShopItemCardContext } from "./SlimeShopItemLists";
import { SlimeShopSlimeList } from "./SlimeShopSlimeList";

const SHOP_CAROUSEL_VISIBLE_COUNT = 5;

type ShopNavigationItem = {
  key: string;
  label: string;
};

type SlimeShopAllCategoriesProps = {
  catalog: SlimeDefinition[];
  shopItems: SlimeShopItem[];
  navigationItems: readonly ShopNavigationItem[];
  searchQuery: string;
  ownedKeys: SlimeColor[];
  busyColor: SlimeColor | null;
  unitLabel: string;
  cardContext: SlimeShopItemCardContext;
  onFilterChange: (filter: ShopFilter) => void;
  onPurchaseSlime: (color: SlimeColor) => void;
};

/** Popular five-up category previews with independent carousel state. */
export function SlimeShopAllCategories({
  catalog,
  shopItems,
  navigationItems,
  searchQuery,
  ownedKeys,
  busyColor,
  unitLabel,
  cardContext,
  onFilterChange,
  onPurchaseSlime,
}: SlimeShopAllCategoriesProps) {
  const [categoryPages, setCategoryPages] = useState<Record<string, number>>({});
  const popularCatalog = [...catalog].sort(
    (left, right) => (right.purchaseCount ?? 0) - (left.purchaseCount ?? 0),
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

  const characterPage = categoryPages.character ?? 0;
  const characterMaxPage = Math.max(
    0,
    Math.ceil(popularCatalog.length / SHOP_CAROUSEL_VISIBLE_COUNT) - 1,
  );

  return (
    <div className={styles.shopAllCategories}>
      <section
        className={styles.shopAllCategory}
        aria-labelledby="shop-all-character"
      >
        <CategoryHeader
          id="shop-all-character"
          label="캐릭터"
          showMore={popularCatalog.length > SHOP_CAROUSEL_VISIBLE_COUNT}
          onMore={() => onFilterChange("character")}
        />
        <div className={styles.shopCarouselRow}>
          {characterPage > 0 ? (
            <CarouselArrow
              label="캐릭터 이전 상품 보기"
              previous
              onClick={() =>
                advanceCategoryPage("character", popularCatalog.length, -1)
              }
            />
          ) : null}
          <SlimeShopSlimeList
            key={`character-${characterPage}`}
            catalog={popularCatalog.slice(
              characterPage * SHOP_CAROUSEL_VISIBLE_COUNT,
              characterPage * SHOP_CAROUSEL_VISIBLE_COUNT +
                SHOP_CAROUSEL_VISIBLE_COUNT,
            )}
            listKey={`character-${characterPage}`}
            searchQuery={searchQuery}
            ownedKeys={ownedKeys}
            busyColor={busyColor}
            unitLabel={unitLabel}
            onPurchaseSlime={onPurchaseSlime}
          />
          {characterPage < characterMaxPage ? (
            <CarouselArrow
              label="캐릭터 다음 상품 보기"
              onClick={() =>
                advanceCategoryPage("character", popularCatalog.length)
              }
            />
          ) : null}
        </div>
      </section>

      {navigationItems
        .filter(({ key }) => key !== "all" && key !== "character")
        .map(({ key, label }) => {
          const items = shopItems
            .filter((item) => shopFilterForItem(item) === key)
            .sort(
              (left, right) =>
                (right.purchaseCount ?? 0) - (left.purchaseCount ?? 0),
            );
          if (items.length === 0) return null;

          const page = categoryPages[key] ?? 0;
          const maxPage = Math.max(
            0,
            Math.ceil(items.length / SHOP_CAROUSEL_VISIBLE_COUNT) - 1,
          );
          const visibleItems = items.slice(
            page * SHOP_CAROUSEL_VISIBLE_COUNT,
            page * SHOP_CAROUSEL_VISIBLE_COUNT +
              SHOP_CAROUSEL_VISIBLE_COUNT,
          );

          return (
            <section
              key={key}
              className={styles.shopAllCategory}
              aria-labelledby={`shop-all-${key}`}
            >
              <CategoryHeader
                id={`shop-all-${key}`}
                label={label}
                showMore={page < maxPage}
                onMore={() => onFilterChange(key as ShopFilter)}
              />
              <div className={styles.shopCarouselRow}>
                {page > 0 ? (
                  <CarouselArrow
                    label={`${label} 이전 상품 보기`}
                    previous
                    onClick={() => advanceCategoryPage(key, items.length, -1)}
                  />
                ) : null}
                <SlimeShopFlatItemList
                  items={visibleItems}
                  label={`${label} 상품 목록`}
                  listKey={`${key}-${page}`}
                  cardContext={cardContext}
                />
                {items.length > SHOP_CAROUSEL_VISIBLE_COUNT ? (
                  <CarouselArrow
                    label={`${label} 다음 상품 보기`}
                    onClick={() => advanceCategoryPage(key, items.length)}
                  />
                ) : null}
              </div>
            </section>
          );
        })}
    </div>
  );
}

function CategoryHeader({
  id,
  label,
  showMore,
  onMore,
}: {
  id: string;
  label: string;
  showMore: boolean;
  onMore: () => void;
}) {
  return (
    <div className={styles.shopAllCategoryHeader}>
      <h3 id={id} className={styles.shopAllCategoryHeading}>
        {label}
      </h3>
      {showMore ? (
        <button
          type="button"
          className={styles.shopAllCategoryMore}
          onClick={onMore}
        >
          더보기
          <ChevronRight size={16} strokeWidth={1.6} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function CarouselArrow({
  label,
  previous = false,
  onClick,
}: {
  label: string;
  previous?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.shopCarouselArrow}
      aria-label={label}
      onClick={onClick}
    >
      <ChevronRight
        size={22}
        strokeWidth={1.6}
        aria-hidden="true"
        className={previous ? styles.shopCarouselArrowPrevious : undefined}
      />
    </button>
  );
}
