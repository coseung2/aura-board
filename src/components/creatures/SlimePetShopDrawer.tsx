import type { RefObject } from "react";
import { createPortal } from "react-dom";

import { formatBpsPercent } from "@/lib/pets/math";
import type { EquippedFloor, SlimeAction } from "@/lib/pets/slime-assets";
import type { SlimeColor, SlimeDefinition, SlimeShopItem } from "@/lib/pets/types";

import { OfficialSlimeSprite } from "./OfficialSlimeSprite";
import styles from "./SlimePetPage.module.css";
import {
  EFFECT_LABELS,
  SHOP_CATEGORY_LABELS,
  type EquippedItemsByColor,
  type Notice,
  type ShopFilter,
} from "./SlimePetModel";

type Props = {
  catalog: SlimeDefinition[];
  drawerItems: SlimeShopItem[];
  ownedKeys: SlimeColor[];
  ownedItemKeys: string[];
  equippedItemKeys: string[];
  equippedItemsByColor: EquippedItemsByColor;
  wardrobeColor: SlimeColor | null;
  shopFilter: ShopFilter;
  unitLabel: string;
  busyColor: SlimeColor | null;
  busyItemKey: string | null;
  notice: Notice | null;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onFilterChange: (filter: ShopFilter) => void;
  onPurchaseSlime: (color: SlimeColor) => void;
  onRefundSlime: (slime: SlimeDefinition) => void;
  onPurchaseItem: (item: SlimeShopItem) => void;
  onRefundItem: (item: SlimeShopItem) => void;
  onEquipItem: (color: SlimeColor, item: SlimeShopItem, nextEquipped: boolean) => void;
};

function previewState(item: SlimeShopItem): {
  action: SlimeAction;
  equippedFloor: EquippedFloor;
} {
  const floor = item.floor;
  if (floor === "water-puddle" || floor === "trampoline") {
    return { action: "floor-interaction", equippedFloor: floor };
  }
  if (floor === "grass-floor") {
    return { action: "idle", equippedFloor: floor };
  }
  return {
    action: item.category === "drink" ? "drink" : "idle",
    equippedFloor: "none",
  };
}

export function SlimePetShopDrawer({
  catalog,
  drawerItems,
  ownedKeys,
  ownedItemKeys,
  equippedItemKeys,
  equippedItemsByColor,
  wardrobeColor,
  shopFilter,
  unitLabel,
  busyColor,
  busyItemKey,
  notice,
  closeButtonRef,
  onClose,
  onFilterChange,
  onPurchaseSlime,
  onRefundSlime,
  onPurchaseItem,
  onRefundItem,
  onEquipItem,
}: Props) {
  const wardrobeName = catalog.find((slime) => slime.color === wardrobeColor)?.nameKo ?? "슬라임";

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.drawerLayer}>
      <div
        className={styles.drawerBackdrop}
        role="presentation"
        aria-hidden="true"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      />
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="slime-drawer-title"
      >
        <div className={styles.drawerHeader}>
          <div>
            <p className={styles.eyebrow}>{wardrobeColor ? "SLIME DRESS UP" : "SLIME SHOP"}</p>
            <h2 id="slime-drawer-title">
              {wardrobeColor ? `${wardrobeName} 꾸미기` : "슬라임 상점"}
            </h2>
            {wardrobeColor ? (
              <p className={styles.drawerSubtitle}>보유한 아이템을 골라 이 슬라임에 적용하세요.</p>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={wardrobeColor ? "꾸미기 닫기" : "상점 닫기"}
          >
            ×
          </button>
        </div>

        <div className={styles.shopFilters} role="group" aria-label="상점 분류">
          {(Object.keys(SHOP_CATEGORY_LABELS) as ShopFilter[])
            .filter((category) => !wardrobeColor || category !== "slimes")
            .map((category) => (
              <button
                key={category}
                type="button"
                className={styles.filterButton}
                aria-pressed={shopFilter === category}
                onClick={() => onFilterChange(category)}
              >
                {SHOP_CATEGORY_LABELS[category]}
              </button>
            ))}
        </div>

        {notice && (
          <p
            className={`${styles.drawerNotice} ${notice.kind === "error" ? styles.statusError : ""}`}
            role={notice.kind === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {notice.text}
          </p>
        )}

        {shopFilter === "slimes" && !wardrobeColor ? (
          <ul className={styles.shopList} aria-label="슬라임 상품 목록">
            {catalog.map((slime) => {
              const owned = ownedKeys.includes(slime.color);
              const busy = busyColor === slime.color;
              return (
                <li key={slime.key} className={styles.shopItem}>
                  <div className={styles.shopImageFrame}>
                    <OfficialSlimeSprite
                      slimeColor={slime.color}
                      evolution="base"
                      action="idle"
                      equippedFloor="none"
                      scale={1}
                      alt={`${slime.nameKo} 미리보기`}
                    />
                  </div>
                  <div className={styles.shopItemCopy}>
                    <h3>{slime.nameKo}</h3>
                    <p>{EFFECT_LABELS[slime.effectKey]} +{formatBpsPercent(slime.baseBuffBps)}</p>
                    <strong>{slime.price.toLocaleString("ko-KR")}{unitLabel}</strong>
                  </div>
                  {owned ? (
                    <div className={styles.shopItemActions}>
                      <span className={styles.shopOwnedChip}>보유 중</span>
                      <button
                        type="button"
                        className={styles.refundButton}
                        disabled={busyColor !== null}
                        onClick={() => onRefundSlime(slime)}
                        aria-label={`${slime.nameKo} 환불`}
                      >
                        {busy ? "환불 중…" : "환불"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.shopBuyButton}
                      disabled={busyColor !== null}
                      onClick={() => onPurchaseSlime(slime.color)}
                      aria-label={`${slime.nameKo} 구매`}
                    >
                      {busy ? "구매 중…" : "구매"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className={styles.shopList} aria-label="상점 상품 목록">
            {drawerItems.length === 0 ? (
              <li className={styles.emptyState}>
                {wardrobeColor
                  ? "이 분류에 보유한 아이템이 없어요. 상점에서 먼저 구매해 주세요."
                  : "이 분류에는 상품이 없어요."}
              </li>
            ) : drawerItems.map((item) => {
              const owned = ownedItemKeys.includes(item.key);
              const equipped = wardrobeColor
                ? (equippedItemsByColor[wardrobeColor] ?? []).includes(item.key)
                : equippedItemKeys.includes(item.key);
              const busy = busyItemKey === item.key;
              return (
                <li key={item.key} className={styles.shopItem}>
                  <div className={styles.shopImageFrame}>
                    {(() => {
                      const preview = previewState(item);
                      return (
                        <OfficialSlimeSprite
                          slimeColor={wardrobeColor ?? "blue"}
                          evolution="base"
                          action={preview.action}
                          equippedFloor={preview.equippedFloor}
                          repeat={preview.action === "drink"}
                          scale={1}
                          alt={`${item.labelKo} 미리보기`}
                        />
                      );
                    })()}
                  </div>
                  <div className={styles.shopItemCopy}>
                    <h3>{item.labelKo}</h3>
                    <p>{SHOP_CATEGORY_LABELS[item.category]}</p>
                    <strong>{item.price.toLocaleString("ko-KR")}{unitLabel}</strong>
                  </div>
                  {!wardrobeColor && owned ? (
                    <div className={styles.shopItemActions}>
                      <span className={styles.shopOwnedChip}>보유 중</span>
                      <button
                        type="button"
                        className={styles.refundButton}
                        disabled={busyItemKey !== null}
                        onClick={() => onRefundItem(item)}
                        aria-label={`${item.labelKo} 환불`}
                      >
                        {busy ? "환불 중…" : "환불"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`${styles.shopBuyButton} ${equipped ? styles.shopBuyButtonRemove : ""}`}
                      disabled={busyItemKey !== null}
                      onClick={() => wardrobeColor
                        ? onEquipItem(wardrobeColor, item, !equipped)
                        : onPurchaseItem(item)}
                      aria-pressed={wardrobeColor ? equipped : undefined}
                      aria-label={`${item.labelKo} ${wardrobeColor ? (equipped ? "해제" : "적용") : "구매"}`}
                    >
                      <span className={styles.spriteSlot} aria-hidden="true">
                        {busy ? "…" : wardrobeColor && equipped ? "✓" : "+"}
                      </span>
                      <span className={styles.buttonLabel}>
                        {busy
                          ? wardrobeColor ? "적용 중…" : "구매 중…"
                          : wardrobeColor
                            ? equipped ? "해제" : "적용"
                            : "구매"}
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>,
    document.body,
  );
}
