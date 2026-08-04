import { useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Ban, ChevronRight, LayoutGrid, Search, ShoppingCart } from "lucide-react";

import { formatBpsPercent } from "@/lib/pets/math";
import { SLIME_COOKIE_GROWTH_SECONDS } from "@/lib/pets/growth";
import { prioritizeEquippedSlimeItems } from "@/lib/pets/item-visibility";
import {
  isSlimeSceneBackground,
  selectSceneBackgroundSpritePath,
  slimeShopPreviewColor,
} from "@/lib/pets/catalog";
import type { EquippedFloor, SlimeAction } from "@/lib/pets/slime-assets";
import type {
  SlimeColor,
  SlimeDefinition,
  SlimeShopItem,
} from "@/lib/pets/types";

import { OfficialSlimeSprite } from "./OfficialSlimeSprite";
import { SLIME_HOME_HERO_RENDERER_SCALE } from "@/lib/pets/slime-sprite-geometry";
import styles from "./SlimePetPage.module.css";
import {
  EFFECT_LABELS,
  SLIME_COOKIE_ITEM_KEY,
  groupSlimeOutfitsByRole,
  groupSlimePropsByKind,
  groupSlimeShopItemsByTier,
  shopFilterForItem,
  slimeItemSpritePath,
  slimeShopNavItems,
  slimeWardrobeNavItems,
  slimeWearablesFromItems,
  formatGrowthHours,
  wardrobeFilterForItem,
  type EquippedItemsByColor,
  type Notice,
  type ShopFilter,
  type WardrobeFilter,
} from "./SlimePetModel";
import type { ClaimedTitle } from "./SlimePetPage";

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

const SLIME_COLOR_SHORT_LABELS: Record<SlimeColor, string> = {
  blue: "블루",
  green: "그린",
  yellow: "옐로",
  purple: "퍼플",
  red: "레드",
};

/** Compact chip labels mirror the mobile wardrobe/shop preview chips. */
const EFFECT_CHIP_LABELS: Record<keyof typeof EFFECT_LABELS, string> = {
  growth_speed: "성장",
  reading_reward: "독서",
  walking_reward: "걷기",
  assignment_reward: "과제",
  comment_reward: "댓글",
};

const SLIME_TRAMPOLINE_ITEM_KEY = "slime-blue-trampoline";

/** Desktop shop catalog cards use the same integer 2x scene as the home hero. */
const SHOP_CATALOG_RENDERER_SCALE = SLIME_HOME_HERO_RENDERER_SCALE;
const SHOP_PREVIEW_SLOT_PX = 192;
const SHOP_CAROUSEL_VISIBLE_COUNT = 5;

function shopItemBuffLabel(
  item: Pick<SlimeShopItem, "effectKey" | "effectBps">,
): string | null {
  if (!item.effectKey || !item.effectBps) return null;
  const label =
    EFFECT_CHIP_LABELS[item.effectKey] ??
    EFFECT_LABELS[item.effectKey] ??
    item.effectKey;
  return `${label} +${formatBpsPercent(item.effectBps)}`;
}

function buffChipTier(bps: number): "bronze" | "silver" | "gold" {
  if (bps > 200) return "gold";
  if (bps > 100) return "silver";
  return "bronze";
}

function previewState(item: SlimeShopItem): {
  action: SlimeAction;
  equippedFloor: EquippedFloor;
} {
  const usesTrampoline = item.key === SLIME_TRAMPOLINE_ITEM_KEY;
  return {
    action: usesTrampoline
      ? "floor-interaction"
      : item.category === "drink"
        ? "drink"
        : "idle",
    equippedFloor: usesTrampoline ? "trampoline" : item.floor ?? "none",
  };
}

const BUFF_TIER_ICON: Record<"bronze" | "silver" | "gold", string> = {
  bronze: "/ui/buff-tiers/buff-tier-bronze.png",
  silver: "/ui/buff-tiers/buff-tier-silver.png",
  gold: "/ui/buff-tiers/buff-tier-gold.png",
};

function BuffTierChip({ label, bps }: { label: string; bps: number }) {
  const tier = buffChipTier(bps);
  return (
    <span
      className={styles.itemPreviewBuff}
      aria-hidden="true"
      data-buff-tier={tier}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BUFF_TIER_ICON[tier]}
        alt=""
        className={styles.itemPreviewBuffIcon}
        draggable={false}
      />
      <span className={styles.itemPreviewBuffText}>{label}</span>
    </span>
  );
}

function wardrobeItemWearerLabel(
  itemKey: string,
  wardrobeColor: SlimeColor | null,
  equippedItemsByColor: EquippedItemsByColor,
): string | null {
  if (!wardrobeColor) return null;
  for (const [color, itemKeys] of Object.entries(equippedItemsByColor)) {
    if (color === wardrobeColor) continue;
    if (!itemKeys?.includes(itemKey)) continue;
    return SLIME_COLOR_SHORT_LABELS[color as SlimeColor] ?? color;
  }
  return null;
}

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
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [categoryPages, setCategoryPages] = useState<Record<string, number>>({});
  const isWardrobe = Boolean(wardrobeColor);
  const navigationItems = isWardrobe
    ? slimeWardrobeNavItems(shopCatalog)
    : slimeShopNavItems(shopCatalog);
  const activeFilter = isWardrobe ? wardrobeFilter : shopFilter;
  const representativeAssetPath = (item: SlimeShopItem) =>
    item.staticSpritePath ?? item.mobileSpritePath ?? item.spritePath;
  const navIconPath = (key: string) => {
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
    const candidates = shopCatalog.filter((item) => {
      if (key === "all") return true;
      if (key === "prop") return item.category === "prop";
      return shopFilterForItem(item) === key;
    });
    const representative = candidates.sort((a, b) => b.price - a.price)[0];
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
    const lastIndex = navigationItems.length - 1;
    const nextIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? lastIndex
          : key === "ArrowRight" || key === "ArrowDown"
            ? (index + 1) % navigationItems.length
            : (index - 1 + navigationItems.length) % navigationItems.length;
    const next = navigationItems[nextIndex];
    if (!next) return;
    if (isWardrobe) onWardrobeFilterChange?.(next.key as WardrobeFilter);
    else onFilterChange(next.key as ShopFilter);
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
    const hidden =
      Boolean(wardrobeColor) &&
      equipped &&
      (hiddenItemsByColor[wardrobeColor!] ?? []).includes(item.key);
    const wornByOther = isWardrobe
      ? wardrobeItemWearerLabel(item.key, wardrobeColor, equippedItemsByColor)
      : null;
    const busy = busyItemKey === item.key;
    const preview = previewState(item);
    // Prop/drink previews keep the active pet color so the card reads as "my
    // slime with this item", matching mobile wardrobe scan order.
    const previewColor =
      isWardrobe && (wardrobeFilter === "prop" || wardrobeFilter === "drink")
        ? (wardrobeColor ?? "blue")
        : slimeShopPreviewColor(item, wardrobeColor ?? "blue");
    const isDrink = item.category === "drink";
    const isFood = item.category === "food";
    const isWearable = item.category === "wearable";
    const isVehicle = item.category === "vehicle" || item.category === "ride";
    const usesTrampoline = item.key === SLIME_TRAMPOLINE_ITEM_KEY;
    const renderedVehicle = isVehicle && !usesTrampoline ? item : null;
    const previewDrinkFlavor = isDrink ? (item.animationKey ?? null) : null;
    const previewWearables =
      isDrink || isWearable ? slimeWearablesFromItems([item]) : undefined;
    const sceneBackground = isSlimeSceneBackground(item);
    const buffLabel = repeatable
      ? `경험치 +${formatGrowthHours(SLIME_COOKIE_GROWTH_SECONDS)}`
      : shopItemBuffLabel(item);
    const isBall = item.key.startsWith("slime-ball-");
    const itemSpritePath = isBall
      ? slimeItemSpritePath(item, previewColor)
      : undefined;
    const hasScene = Boolean(
      sceneBackground || isVehicle || preview.equippedFloor !== "none",
    );

    if (isWardrobe) {
      const actionLabel = equipped
        ? "해제"
        : wornByOther
          ? "여기로 옮기기"
          : "장착";
      const accessibilityAction = equipped
        ? "해제"
        : wornByOther
          ? `${wornByOther} 슬라임 장착 중, 옮겨서 장착`
          : "장착";
      return (
        <li
          key={item.key}
          className={[
            styles.shopItem,
            styles.shopProductCard,
            hasScene ? styles.wardrobeItemScene : "",
            equipped ? styles.wardrobeItemEquipped : "",
            wornByOther ? styles.wardrobeItemWornByOther : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-selected={equipped}
          data-equipped={equipped ? "true" : "false"}
          data-worn-by-other={wornByOther ?? undefined}
          data-hidden={hidden ? "true" : undefined}
        >
          <div
            className={[
              styles.shopImageFrame,
              styles.shopMedia,
              hasScene ? styles.shopImageFrameScene : "",
              sceneBackground ? styles.shopImageFrameSceneBackground : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div
              className={[
                styles.wardrobePreviewVisual,
                wornByOther ? styles.wardrobeContentDimmed : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <OfficialSlimeSprite
                slimeColor={previewColor}
                evolution="base"
                action={preview.action}
                equippedFloor={preview.equippedFloor}
                itemSpritePath={
                  sceneBackground ? undefined : itemSpritePath
                }
                backgroundSpritePath={
                  sceneBackground
                    ? selectSceneBackgroundSpritePath(item)
                    : undefined
                }
                expandSceneSurfaces={sceneBackground}
                vehicleSpritePath={
                  renderedVehicle?.vehicleSheetPath ?? renderedVehicle?.spritePath
                }
                vehicleGroundedSpritePath={
                  renderedVehicle?.vehicleGroundedSpritePath
                }
                vehicleEffectSpritePaths={
                  renderedVehicle?.vehicleEffectSpritePaths
                }
                vehicleFrameCount={renderedVehicle?.vehicleFrameCount}
                vehicleGroundedFrameCount={
                  renderedVehicle?.vehicleGroundedFrameCount
                }
                vehicleGroundedFrameDurationMs={
                  renderedVehicle?.vehicleGroundedFrameDurationMs
                }
                vehicleCanvasHeight={renderedVehicle?.vehicleCanvasHeight}
                vehicleCharacterOffsetY={
                  renderedVehicle?.vehicleCharacterOffsetY
                }
                vehicleBobY={renderedVehicle?.vehicleBobY}
                vehicleRiseY={renderedVehicle?.vehicleRiseY}
                vehicleOffsetX={renderedVehicle?.vehicleOffsetX}
                wearables={previewWearables}
                drinkFlavor={previewDrinkFlavor}
                repeat={preview.action === "drink" || isBall}
                scale={1}
                alt={`${item.labelKo} 미리보기`}
              />
              {buffLabel ? (
                <BuffTierChip label={buffLabel} bps={item.effectBps ?? 0} />
              ) : null}
            </div>
            {wornByOther ? (
              <div className={styles.wardrobeWornOverlay} aria-hidden="true">
                <span className={styles.wardrobeWornOverlayIcon}>⊘</span>
                <span className={styles.wardrobeWornOverlayText}>
                  {wornByOther} 슬라임에
                  <br />
                  장착 중
                </span>
              </div>
            ) : null}
          </div>
          <div
            className={`${styles.shopItemCopy} ${styles.shopCardBody} ${styles.wardrobeCardBody}`.trim()}
          >
            <div
              className={[
                styles.shopCardCopy,
                styles.wardrobeItemCopy,
                wornByOther ? styles.wardrobeContentDimmed : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className={styles.shopCardTitleRow}>
                <h3>{item.labelKo}</h3>
                {buffLabel ? (
                  <BuffTierChip label={buffLabel} bps={item.effectBps ?? 0} />
                ) : null}
              </div>
              {hidden ? <p>외형 숨김 · 버프는 유지</p> : null}
            </div>
            <div className={styles.wardrobeItemActions}>
              {equipped ? (
                <>
                  <button
                    type="button"
                    className={`${styles.wardrobeInlineAction} ${styles.wardrobeInlineActionDanger}`}
                    disabled={busyItemKey !== null}
                    onClick={() =>
                      wardrobeColor && onEquipItem(wardrobeColor, item, false)
                    }
                    aria-pressed={true}
                    aria-label={`${item.labelKo} 해제`}
                  >
                    {busy ? "처리 중…" : "해제"}
                  </button>
                  {onToggleItemVisibility && wardrobeColor ? (
                    <button
                      type="button"
                      className={styles.wardrobeInlineAction}
                      disabled={busyItemKey !== null}
                      onClick={() =>
                        onToggleItemVisibility(wardrobeColor, item, !hidden)
                      }
                      aria-pressed={hidden}
                      aria-label={`${item.labelKo} 외형 ${hidden ? "보이기" : "숨기기"}`}
                    >
                      {busy ? "처리 중…" : hidden ? "보이기" : "숨기기"}
                    </button>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  className={`${styles.wardrobeInlineAction} ${styles.wardrobeInlineActionPrimary}`}
                  disabled={busyItemKey !== null}
                  onClick={() =>
                    wardrobeColor && onEquipItem(wardrobeColor, item, true)
                  }
                  aria-pressed={false}
                  aria-label={`${item.labelKo} ${wornByOther ? "여기로 옮기기" : "장착"}`}
                  title={accessibilityAction}
                >
                  {busy ? "처리 중…" : actionLabel}
                </button>
              )}
            </div>
          </div>
        </li>
      );
    }

    return (
      <li
        key={item.key}
        className={[
          styles.shopItem,
          styles.shopProductCard,
          hasScene ? styles.shopItemScene : "",
          sceneBackground ? styles.shopItemSceneBackground : "",
          owned && !repeatable ? styles.shopItemOwned : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="button"
        tabIndex={busy || (owned && !repeatable) ? -1 : 0}
        aria-disabled={busy || (owned && !repeatable)}
        aria-label={`${item.labelKo} ${owned && !repeatable ? "보유 중" : "구매 미리보기"}`}
        onClick={() => {
          if (!busy && (!owned || repeatable)) onPurchaseItem(item);
        }}
        onKeyDown={(event) => {
          if (busy || (owned && !repeatable) || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          onPurchaseItem(item);
        }}
      >
        <div
          className={[
            styles.shopImageFrame,
            styles.shopMedia,
            hasScene ? styles.shopImageFrameScene : "",
            sceneBackground ? styles.shopImageFrameSceneBackground : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ minHeight: SHOP_PREVIEW_SLOT_PX }}
        >
          {isFood ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={item.spritePath}
              alt={`${item.labelKo} 미리보기`}
              className={styles.shopFoodPreview}
              draggable={false}
            />
          ) : (
            <OfficialSlimeSprite
              slimeColor={previewColor}
              evolution="base"
              action={preview.action}
              equippedFloor={preview.equippedFloor}
              itemSpritePath={itemSpritePath}
              backgroundSpritePath={sceneBackground ? item.spritePath : undefined}
              featherBackground={false}
              expandSceneSurfaces={sceneBackground}
              vehicleSpritePath={
                renderedVehicle?.vehicleSheetPath ?? renderedVehicle?.spritePath
              }
              vehicleGroundedSpritePath={
                renderedVehicle?.vehicleGroundedSpritePath
              }
              vehicleEffectSpritePaths={
                renderedVehicle?.vehicleEffectSpritePaths
              }
              vehicleFrameCount={renderedVehicle?.vehicleFrameCount}
              vehicleGroundedFrameCount={
                renderedVehicle?.vehicleGroundedFrameCount
              }
              vehicleGroundedFrameDurationMs={
                renderedVehicle?.vehicleGroundedFrameDurationMs
              }
              vehicleCanvasHeight={renderedVehicle?.vehicleCanvasHeight}
              vehicleCharacterOffsetY={
                renderedVehicle?.vehicleCharacterOffsetY
              }
              vehicleBobY={renderedVehicle?.vehicleBobY}
              vehicleRiseY={renderedVehicle?.vehicleRiseY}
              vehicleOffsetX={renderedVehicle?.vehicleOffsetX}
              wearables={previewWearables}
              drinkFlavor={previewDrinkFlavor}
              repeat={preview.action === "drink" || isBall}
              scale={SHOP_CATALOG_RENDERER_SCALE}
              alt={`${item.labelKo} 미리보기`}
            />
          )}
        </div>
        <div className={`${styles.shopItemCopy} ${styles.shopCardBody}`.trim()}>
          <div className={styles.shopCardCopy}>
            <div className={styles.shopCardTitleRow}>
              <h3>{item.labelKo}</h3>
            </div>
            <p className={styles.shopPrice}>
              {item.price.toLocaleString("ko-KR")}{unitLabel}
            </p>
          </div>
        </div>
        {owned && !repeatable ? (
          <div className={styles.shopOwnedOverlay} aria-hidden="true">
            <Ban size={22} strokeWidth={2.25} />
            <span>보유 중</span>
          </div>
        ) : null}
      </li>
    );
  };

  const renderTitleList = () => {
    if (!wardrobeColor) return null;
    const equippedTitleKey = equippedTitleByColor[wardrobeColor] ?? null;
    if (claimedTitles.length === 0) {
      return (
        <ul className={styles.wardrobeList} aria-label="칭호 목록">
          <li className={styles.emptyState}>
            걷기와 독서 미션에서 칭호를 받아 오세요.
          </li>
        </ul>
      );
    }
    const orderedTitles = prioritizeEquippedSlimeItems(
      claimedTitles,
      equippedTitleKey ? [equippedTitleKey] : [],
    );
    return (
      <ul className={styles.wardrobeList} aria-label="칭호 목록">
        {orderedTitles.map((title) => {
          const equipped = equippedTitleKey === title.key;
          const busy =
            busyTitleColor === wardrobeColor || busyItemKey === title.key;
          return (
            <li
              key={title.key}
              className={[
                styles.wardrobeItem,
                equipped ? styles.wardrobeItemEquipped : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-selected={equipped}
              data-equipped={equipped ? "true" : "false"}
            >
              <div className={styles.wardrobePreview}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={title.imagePath}
                  alt=""
                  aria-hidden="true"
                  className={styles.titlePreviewImage}
                />
              </div>
              <div className={styles.wardrobeCardBody}>
                <div className={styles.wardrobeItemCopy}>
                  <h3>{title.label}</h3>
                  <p>+{formatBpsPercent(title.buffBps)}</p>
                </div>
                <div className={styles.wardrobeItemActions}>
                  <button
                    type="button"
                    className={`${styles.wardrobeInlineAction} ${
                      equipped
                        ? styles.wardrobeInlineActionDanger
                        : styles.wardrobeInlineActionPrimary
                    }`}
                    disabled={busyTitleColor !== null || busyItemKey !== null}
                    onClick={() =>
                      onEquipTitle?.(
                        wardrobeColor,
                        equipped ? null : title.key,
                      )
                    }
                    aria-pressed={equipped}
                    aria-label={`${title.label} 칭호 ${equipped ? "해제" : "장착"}`}
                  >
                    {busy ? "처리 중…" : equipped ? "해제" : "장착"}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  const renderSlimeList = (sourceCatalog = catalog, listKey?: string) => (
    <ul
      key={listKey}
      className={[styles.shopList, listKey ? styles.shopCarouselPage : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label="슬라임 상품 목록"
    >
      {sourceCatalog
        .filter((slime) =>
          slime.nameKo.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase()),
        )
        .map((slime) => {
        const owned = ownedKeys.includes(slime.color);
        const busy = busyColor === slime.color;
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
              if (busy || owned || (event.key !== "Enter" && event.key !== " ")) return;
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
                scale={SHOP_CATALOG_RENDERER_SCALE}
                alt={`${slime.nameKo} 미리보기`}
              />
            </div>
            <div className={`${styles.shopItemCopy} ${styles.shopCardBody}`.trim()}>
              <div className={styles.shopCardCopy}>
                <div className={styles.shopCardTitleRow}>
                  <h3>{slime.nameKo}</h3>
                  <BuffTierChip
                    label={`기본 효과 +${formatBpsPercent(slime.baseBuffBps)}`}
                    bps={slime.baseBuffBps}
                  />
                </div>
                <p className={styles.shopPrice}>
                  {slime.price.toLocaleString("ko-KR")}{unitLabel}
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

  const content = (
    <>
      {presentation === "modal" ? (
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>
              {isWardrobe ? "SLIME DRESS UP" : "SLIME SHOP"}
            </p>
            <h2 id="slime-modal-title">
              {isWardrobe ? `${wardrobeName} 꾸미기` : "슬라임 상점"}
            </h2>
            {isWardrobe ? (
              <p className={styles.drawerSubtitle}>
                보유한 아이템을 골라 이 슬라임에 장착하세요.
              </p>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={isWardrobe ? "꾸미기 닫기" : "상점 닫기"}
          >
            ×
          </button>
        </div>
      ) : null}

      <nav
        className={styles.shopNavigation}
        aria-label={isWardrobe ? "보유 아이템 카테고리" : "상점 탐색"}
      >
        <div
          className={styles.shopFilters}
          role="tablist"
          aria-label={isWardrobe ? "꾸미기 분류" : "상점 분류"}
          aria-orientation="horizontal"
        >
          {navigationItems.map(({ key, label }, index) => {
            const selected = activeFilter === key;
            const tabId = `slime-shop-tab-${key}`;
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
                      : "";
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
                onClick={() =>
                  isWardrobe
                    ? onWardrobeFilterChange?.(key as WardrobeFilter)
                    : onFilterChange(key as ShopFilter)
                }
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                <span className={styles.filterButtonContent}>
                  {key === "all" ? (
                    <LayoutGrid className={styles.filterButtonIcon} size={40} strokeWidth={1.35} aria-hidden="true" />
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
        {!isWardrobe && onSearchQueryChange ? (
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
        {!isWardrobe && onOpenCart ? (
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


      <div
        id="slime-shop-panel"
        role="tabpanel"
        aria-labelledby={`slime-shop-tab-${activeFilter}`}
        tabIndex={0}
        className={styles.shopPanel}
      >
        {renderGroupedItems()}
      </div>
    </>
  );

  if (presentation === "inline") {
    return (
      <section className={styles.inlineShop} aria-label="슬라임 상점">
        {content}
      </section>
    );
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.modalLayer}>
      <div
        className={styles.modalBackdrop}
        role="presentation"
        aria-hidden="true"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose?.();
        }}
      />
      <div
        className={styles.wardrobeModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="slime-modal-title"
      >
        {content}
      </div>
    </div>,
    document.body,
  );
}

/** @deprecated Prefer SlimePetShopPanel. Kept for local import compatibility. */
export const SlimePetShopDrawer = SlimePetShopPanel;
