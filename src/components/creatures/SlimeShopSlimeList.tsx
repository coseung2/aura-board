"use client";

import type { KeyboardEvent } from "react";

import { Undo2 } from "lucide-react";

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
  onRefundSlime: (slime: SlimeDefinition) => void;
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
  onRefundSlime,
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
              {...(owned
                ? {}
                : {
                    role: "button",
                    tabIndex: busy ? -1 : 0,
                    "aria-disabled": busy,
                    "aria-label": `${slime.nameKo} 구매`,
                    onClick: () => {
                      if (!busy) onPurchaseSlime(slime.color);
                    },
                    onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => {
                      if (
                        busy ||
                        (event.key !== "Enter" && event.key !== " ")
                      ) {
                        return;
                      }
                      event.preventDefault();
                      onPurchaseSlime(slime.color);
                    },
                  })}
            >
              <div
                className={`${styles.shopImageFrame} ${styles.shopMedia} ${owned ? styles.shopMediaOwned : ""}`.trim()}
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
                {owned ? (
                  <button
                    type="button"
                    className={styles.shopRefundOverlay}
                    disabled={busyColor !== null}
                    onClick={() => onRefundSlime(slime)}
                    aria-label={`${slime.nameKo} 환불`}
                  >
                    <Undo2 size={16} strokeWidth={2.25} aria-hidden="true" />
                    <span>{busy ? "처리 중…" : "환불하기"}</span>
                  </button>
                ) : null}
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
            </li>
          );
        })}
    </ul>
  );
}
