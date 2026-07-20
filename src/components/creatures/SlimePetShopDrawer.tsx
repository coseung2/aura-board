import { useRef, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";

import { formatBpsPercent } from "@/lib/pets/math";
import type { EquippedFloor, SlimeAction } from "@/lib/pets/slime-assets";
import type { SlimeColor, SlimeDefinition, SlimeShopItem } from "@/lib/pets/types";

import { OfficialSlimeSprite } from "./OfficialSlimeSprite";
import styles from "./SlimePetPage.module.css";
import {
  EFFECT_LABELS,
  SLIME_COOKIE_ITEM_KEY,
  SHOP_NAV_ITEMS,
  shopItemCategoryLabel,
  slimeItemSpritePath,
  type EquippedItemsByColor,
  type Notice,
  type ShopFilter,
} from "./SlimePetModel";

type Props = {
  catalog: SlimeDefinition[];
  drawerItems: SlimeShopItem[];
  ownedKeys: SlimeColor[];
  ownedItemKeys: string[];
  ownedItemQuantities: Record<string, number>;
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

type PropSubgroup = "ball" | "drink" | "other";

function propSubgroup(item: SlimeShopItem): PropSubgroup {
  if (item.key.startsWith("slime-ball-")) return "ball";
  if (String(item.category) === "drink") return "drink";
  return "other";
}

const PROP_SUBGROUP_LABELS: Record<PropSubgroup, string> = {
  ball: "공",
  drink: "음료",
  other: "소품",
};

export function SlimePetShopDrawer({
  catalog,
  drawerItems,
  ownedKeys,
  ownedItemKeys,
  ownedItemQuantities,
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
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const key = event.key;
    if (key !== "ArrowRight" && key !== "ArrowDown" && key !== "ArrowLeft" && key !== "ArrowUp" && key !== "Home" && key !== "End") {
      return;
    }
    event.preventDefault();
    const lastIndex = SHOP_NAV_ITEMS.length - 1;
    const nextIndex = key === "Home"
      ? 0
      : key === "End"
        ? lastIndex
        : key === "ArrowRight" || key === "ArrowDown"
          ? (index + 1) % SHOP_NAV_ITEMS.length
          : (index - 1 + SHOP_NAV_ITEMS.length) % SHOP_NAV_ITEMS.length;
    const next = SHOP_NAV_ITEMS[nextIndex];
    if (!next) return;
    onFilterChange(next.key);
    tabRefs.current[nextIndex]?.focus();
  };

  const renderShopItem = (item: SlimeShopItem) => {
    const repeatable = item.key === SLIME_COOKIE_ITEM_KEY;
    const ownedQuantity = Math.max(
      0,
      Math.floor(ownedItemQuantities[item.key] ?? 0),
    );
    const owned = repeatable
      ? ownedQuantity > 0 || ownedItemKeys.includes(item.key)
      : ownedItemKeys.includes(item.key);
    const equipped = wardrobeColor
      ? (equippedItemsByColor[wardrobeColor] ?? []).includes(item.key)
      : equippedItemKeys.includes(item.key);
    const busy = busyItemKey === item.key;
    const preview = previewState(item);
    const previewColor = wardrobeColor ?? "blue";
    const itemSpritePath = slimeItemSpritePath(item, previewColor);
    const isBall = item.key.startsWith("slime-ball-");

    return (
      <li key={item.key} className={styles.shopItem}>
        <div className={styles.shopImageFrame}>
          <OfficialSlimeSprite
            slimeColor={previewColor}
            evolution="base"
            action={preview.action}
            equippedFloor={preview.equippedFloor}
            itemSpritePath={itemSpritePath}
            repeat={preview.action === "drink" || isBall}
            scale={1}
            alt={`${item.labelKo} 미리보기`}
          />
        </div>
        <div className={styles.shopItemCopy}>
          <h3>{item.labelKo}</h3>
          <p>{shopItemCategoryLabel(item)}</p>
          <strong>{item.price.toLocaleString("ko-KR")}{unitLabel}</strong>
        </div>
        {!wardrobeColor && owned && !repeatable ? (
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
            aria-label={`${item.labelKo} ${wardrobeColor ? (equipped ? "해제" : "적용") : "구매"}${!wardrobeColor && repeatable && ownedQuantity > 0 ? ` (보유 ${ownedQuantity}개)` : ""}`}
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
            {!wardrobeColor && repeatable && ownedQuantity > 0 ? (
              <span className={styles.shopQuantity} aria-hidden="true">
                {ownedQuantity}개
              </span>
            ) : null}
          </button>
        )}
      </li>
    );
  };

  const renderSlimeList = () => (
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
  );

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

        <nav className={styles.shopNavigation} aria-label="상점 탐색">
          <div
            className={styles.shopFilters}
            role="tablist"
            aria-label="상점 분류"
            aria-orientation="horizontal"
          >
            {SHOP_NAV_ITEMS.map(({ key, label }, index) => {
              const selected = shopFilter === key;
              const tabId = `slime-shop-tab-${key}`;
              return (
                <button
                  key={key}
                  ref={(element) => {
                    tabRefs.current[index] = element;
                  }}
                  id={tabId}
                  type="button"
                  role="tab"
                  className={styles.filterButton}
                  aria-selected={selected}
                  aria-controls="slime-shop-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onFilterChange(key)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </nav>

        {notice && (
          <p
            className={`${styles.drawerNotice} ${notice.kind === "error" ? styles.statusError : ""}`}
            role={notice.kind === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {notice.text}
          </p>
        )}

        <div
          id="slime-shop-panel"
          role="tabpanel"
          aria-labelledby={`slime-shop-tab-${shopFilter}`}
          tabIndex={0}
          className={styles.shopPanel}
        >
        {shopFilter === "character" && !wardrobeColor ? (
          renderSlimeList()
        ) : shopFilter === "all" && !wardrobeColor ? (
          <>
            {renderSlimeList()}
            <ul className={styles.shopList} aria-label="상점 상품 목록">
              {drawerItems.length === 0 ? (
                <li className={styles.emptyState}>이 분류에는 상품이 없어요.</li>
              ) : drawerItems.map(renderShopItem)}
            </ul>
          </>
        ) : shopFilter === "prop" ? (
          drawerItems.length === 0 ? (
            <ul className={styles.shopList} aria-label="소품 상품 목록">
              <li className={styles.emptyState}>
                {wardrobeColor
                  ? "이 분류에 보유한 아이템이 없어요. 상점에서 먼저 구매해 주세요."
                  : "이 분류에는 상품이 없어요."}
              </li>
            </ul>
          ) : (
            <div className={styles.shopGroups}>
              {(Object.keys(PROP_SUBGROUP_LABELS) as PropSubgroup[]).map((subgroup) => {
                const items = drawerItems.filter((item) => propSubgroup(item) === subgroup);
                if (items.length === 0) return null;
                const headingId = `slime-shop-prop-${subgroup}`;
                return (
                  <section key={subgroup} className={styles.shopGroup} aria-labelledby={headingId}>
                    <h3 id={headingId} className={styles.shopGroupHeading}>{PROP_SUBGROUP_LABELS[subgroup]}</h3>
                    <ul className={styles.shopList} aria-label={`${PROP_SUBGROUP_LABELS[subgroup]} 상품 목록`}>
                      {items.map(renderShopItem)}
                    </ul>
                  </section>
                );
              })}
            </div>
          )
        ) : (
          <ul className={styles.shopList} aria-label="상점 상품 목록">
            {drawerItems.length === 0 ? (
              <li className={styles.emptyState}>
                {wardrobeColor
                  ? "이 분류에 보유한 아이템이 없어요. 상점에서 먼저 구매해 주세요."
                  : "이 분류에는 상품이 없어요."}
              </li>
            ) : drawerItems.map(renderShopItem)}
          </ul>
        )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
