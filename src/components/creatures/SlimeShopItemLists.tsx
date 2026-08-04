import type { SlimeShopItem } from "@/lib/pets/types";

import styles from "./SlimePetPage.module.css";
import { groupSlimeShopItemsByTier } from "./SlimePetModel";
import {
  SlimeShopItemCard,
  type SlimeShopItemCardProps,
} from "./SlimeShopItemCard";

export type SlimeShopItemCardContext = Omit<
  SlimeShopItemCardProps,
  "item"
>;

type SlimeShopItemListProps = {
  items: readonly SlimeShopItem[];
  label: string;
  cardContext: SlimeShopItemCardContext;
  listKey?: string;
};

function renderCards(
  items: readonly SlimeShopItem[],
  cardContext: SlimeShopItemCardContext,
) {
  return items.map((item) => (
    <SlimeShopItemCard key={item.key} item={item} {...cardContext} />
  ));
}

export function SlimeShopFlatItemList({
  items,
  label,
  cardContext,
  listKey,
}: SlimeShopItemListProps) {
  return (
    <ul
      key={listKey}
      className={[styles.shopList, listKey ? styles.shopCarouselPage : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
    >
      {renderCards(items, cardContext)}
    </ul>
  );
}

export function SlimeShopWardrobeItemList({
  items,
  label,
  cardContext,
}: SlimeShopItemListProps) {
  return (
    <ul className={styles.wardrobeList} aria-label={label}>
      {items.length === 0 ? (
        <li className={styles.emptyState}>
          이 카테고리에 보유한 아이템이 없어요.
        </li>
      ) : (
        renderCards(items, cardContext)
      )}
    </ul>
  );
}

export function SlimeShopTieredItemList({
  items,
  label,
  cardContext,
}: SlimeShopItemListProps) {
  if (items.length === 0) {
    return (
      <ul className={styles.shopList} aria-label={label}>
        <li className={styles.emptyState}>이 분류에는 상품이 없어요.</li>
      </ul>
    );
  }

  return (
    <div className={styles.shopGroups}>
      {groupSlimeShopItemsByTier(items).map((tier) => (
        <section
          key={`${label}-${tier.price}-${tier.label || "default"}`}
          className={styles.shopGroup}
          aria-label={tier.label || label}
        >
          {tier.label ? (
            <h3 className={styles.shopTierHeading}>{tier.label}</h3>
          ) : null}
          <ul className={styles.shopList} aria-label={label}>
            {renderCards(tier.items, cardContext)}
          </ul>
        </section>
      ))}
    </div>
  );
}
