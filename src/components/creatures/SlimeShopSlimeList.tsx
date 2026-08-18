"use client";

import { Ban } from "lucide-react";

import { formatBpsPercent, slimeBuffBpsForStage } from "@/lib/pets/math";
import { SLIME_HOME_HERO_RENDERER_SCALE } from "@/lib/pets/slime-sprite-geometry";
import type { SlimeColor, SlimeDefinition } from "@/lib/pets/types";

import { OfficialSlimeSprite } from "./OfficialSlimeSprite";
import { SlimeBuffTierChip } from "./SlimeBuffTierChip";
import { styles } from "./SlimePetPage.styles";
import { EFFECT_LABELS } from "./SlimePetModel";

const SHOP_PREVIEW_SLOT_PX = 192;

type SlimeShopSlimeListProps = {
  catalog: readonly SlimeDefinition[];
  listKey?: string;
  searchQuery: string;
  ownedKeys: readonly SlimeColor[];
  growthByColor: Partial<Record<SlimeColor, { stage?: number }>>;
  busyColor: SlimeColor | null;
  unitLabel: string;
  onPurchaseSlime: (color: SlimeColor) => void;
};

/** Character catalog list shared by the character tab and all-category carousel. */
export function SlimeShopSlimeList({
  catalog,
  listKey,
  searchQuery,
  ownedKeys,
  growthByColor,
  busyColor,
  unitLabel,
  onPurchaseSlime,
}: SlimeShopSlimeListProps) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  return (
    <ul
      className={[styles.shopList, listKey ? styles.shopCarouselPage : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label="슬라임 상품 목록"
    >
      {catalog
        .filter((slime) =>
          slime.nameKo.toLocaleLowerCase().includes(normalizedQuery),
        )
        .map((slime) => {
          const owned = ownedKeys.includes(slime.color);
          const busy = busyColor === slime.color;
          const buffBps = slimeBuffBpsForStage(
            slime.baseBuffBps,
            growthByColor[slime.color]?.stage,
          );
          const buffLabel = `${EFFECT_LABELS[slime.effectKey]} +${formatBpsPercent(buffBps)}`;
          return (
            <li
              key={slime.key}
              className={`${styles.shopItem} ${styles.shopProductCard} ${owned ? styles.shopItemOwned : ""}`.trim()}
              role="button"
              tabIndex={busy || owned ? -1 : 0}
              aria-disabled={busy || owned}
              aria-label={`${slime.nameKo} ${owned ? "보유 중" : "구매"}`}
              onClick={() => {
                if (!busy && !owned) onPurchaseSlime(slime.color);
              }}
              onKeyDown={(event) => {
                if (
                  busy ||
                  owned ||
                  (event.key !== "Enter" && event.key !== " ")
                ) {
                  return;
                }
                event.preventDefault();
                onPurchaseSlime(slime.color);
              }}
            >
              <div
                className={`${styles.shopImageFrame} ${styles.shopMedia}`.trim()}
                style={{ minHeight: SHOP_PREVIEW_SLOT_PX }}
              >
                <OfficialSlimeSprite
                  slimeColor={slime.color}
                  evolution="base"
                  action="idle"
                  equippedFloor="none"
                  scale={SLIME_HOME_HERO_RENDERER_SCALE}
                  alt={`${slime.nameKo} 미리보기`}
                />
              </div>
              <div
                className={`${styles.shopItemCopy} ${styles.shopCardBody}`.trim()}
              >
                <div className={styles.shopCardCopy}>
                  <div className={styles.shopCardTitleRow}>
                    <h3>{slime.nameKo}</h3>
                    <SlimeBuffTierChip label={buffLabel} bps={buffBps} />
                  </div>
                  <p className={styles.shopPrice}>
                    {slime.price.toLocaleString("ko-KR")}
                    {unitLabel}
                  </p>
                </div>
              </div>
              {owned ? (
                <div className={styles.shopOwnedOverlay} aria-hidden="true">
                  <Ban size={22} strokeWidth={2.25} />
                  <span>보유 중</span>
                </div>
              ) : null}
            </li>
          );
        })}
    </ul>
  );
}
