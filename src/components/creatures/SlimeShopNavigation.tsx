"use client";

import { useRef, type KeyboardEvent } from "react";
import { LayoutGrid, Search, ShoppingCart } from "lucide-react";

import type { SlimeDefinition, SlimeShopItem } from "@/lib/pets/types";

import styles from "./SlimePetPage.module.css";
import {
  shopFilterForItem,
  type ShopFilter,
  type WardrobeFilter,
} from "./SlimePetModel";

type NavigationKey = ShopFilter | WardrobeFilter;

type SlimeShopNavigationProps = {
  items: readonly { key: NavigationKey; label: string }[];
  activeKey: NavigationKey;
  wardrobe: boolean;
  catalog: readonly SlimeDefinition[];
  shopCatalog: readonly SlimeShopItem[];
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  cartCount?: number;
  onOpenCart?: () => void;
  onSelect: (key: NavigationKey) => void;
};

function representativeAssetPath(item: SlimeShopItem): string {
  return item.staticSpritePath ?? item.mobileSpritePath ?? item.spritePath;
}

/** Navigation owns icon selection, roving tab focus, search, and cart entry. */
export function SlimeShopNavigation({
  items,
  activeKey,
  wardrobe,
  catalog,
  shopCatalog,
  searchQuery = "",
  onSearchQueryChange,
  cartCount = 0,
  onOpenCart,
  onSelect,
}: SlimeShopNavigationProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const navIconPath = (key: NavigationKey) => {
    if (key === "character") {
      return [...catalog].sort((a, b) => b.price - a.price)[0]?.spritePath ?? null;
    }
    if (key === "outfit") {
      return "/creatures/slimes/official/composition/eyewear/prism-kaleidoscope-glasses/idle/sheet.png";
    }
    if (key === "prop") {
      return "/creatures/slimes/official/composition/drink/strawberry-soda/drink-strawberry-soda/blue/sheet.png";
    }
    if (key === "food") {
      return "/creatures/slimes/official/shared/cookie-shop-icon-256.png";
    }
    if (key === "title") {
      return "/creatures/slimes/ui/titles/yaho.png";
    }
    const candidates = shopCatalog.filter((item) => {
      if (key === "all") return true;
      return shopFilterForItem(item) === key;
    });
    const representative = [...candidates].sort((a, b) => b.price - a.price)[0];
    return representative ? representativeAssetPath(representative) : null;
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const key = event.key;
    if (
      key !== "ArrowRight" &&
      key !== "ArrowDown" &&
      key !== "ArrowLeft" &&
      key !== "ArrowUp" &&
      key !== "Home" &&
      key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    const lastIndex = items.length - 1;
    const nextIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? lastIndex
          : key === "ArrowRight" || key === "ArrowDown"
            ? (index + 1) % items.length
            : (index - 1 + items.length) % items.length;
    const next = items[nextIndex];
    if (!next) return;
    onSelect(next.key);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <nav
      className={styles.shopNavigation}
      aria-label={wardrobe ? "보유 아이템 카테고리" : "상점 탐색"}
    >
      <div
        className={styles.shopFilters}
        role="tablist"
        aria-label={wardrobe ? "꾸미기 분류" : "상점 분류"}
        aria-orientation="horizontal"
      >
        {items.map(({ key, label }, index) => {
          const selected = activeKey === key;
          const iconPath = navIconPath(key);
          const iconIsSheet = key === "prop" || key === "outfit";
          const iconScaleClass =
            key === "character"
              ? styles.filterButtonIconCharacter
              : key === "vehicle"
                ? styles.filterButtonIconVehicle
                : key === "food"
                  ? styles.filterButtonIconFood
                  : key === "background"
                    ? styles.filterButtonIconBackground
                    : key === "title"
                      ? styles.filterButtonIconTitle
                      : "";
          return (
            <button
              key={key}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              id={`slime-shop-tab-${key}`}
              type="button"
              role="tab"
              className={styles.filterButton}
              aria-selected={selected}
              aria-controls="slime-shop-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(key)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <span className={styles.filterButtonContent}>
                {key === "all" ? (
                  <LayoutGrid
                    className={styles.filterButtonIcon}
                    size={40}
                    strokeWidth={1.35}
                    aria-hidden="true"
                  />
                ) : iconPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <span
                    className={
                      iconIsSheet
                        ? `${styles.filterButtonSpriteFrame} ${key === "outfit" ? styles.filterButtonSpriteOutfit : styles.filterButtonSpriteProp}`
                        : `${styles.filterButtonIconFrame} ${iconScaleClass}`.trim()
                    }
                  >
                    <img src={iconPath} alt="" aria-hidden="true" />
                  </span>
                ) : null}
                <span>{label}</span>
              </span>
            </button>
          );
        })}
      </div>
      {!wardrobe && onSearchQueryChange ? (
        <label className={styles.shopSearchField}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="상품 검색"
            aria-label="상품 검색"
          />
        </label>
      ) : null}
      {!wardrobe && onOpenCart ? (
        <button
          type="button"
          className={styles.cartEntry}
          onClick={onOpenCart}
          aria-label={cartCount > 0 ? `장바구니 ${cartCount}개` : "장바구니"}
        >
          <span className={styles.cartIconWrap} aria-hidden="true">
            <ShoppingCart size={22} strokeWidth={2} />
            <span className={styles.cartBadge}>{cartCount}</span>
          </span>
          <span className={styles.cartLabel}>장바구니</span>
        </button>
      ) : null}
    </nav>
  );
}
