"use client";

import { Ban } from "lucide-react";

import {
  isSlimeSceneBackground,
  selectSceneBackgroundSpritePath,
  slimeShopPreviewColor,
} from "@/lib/pets/catalog";
import { SLIME_COOKIE_GROWTH_SECONDS } from "@/lib/pets/growth";
import { SLIME_HOME_HERO_RENDERER_SCALE } from "@/lib/pets/slime-sprite-geometry";
import type { SlimeColor, SlimeShopItem } from "@/lib/pets/types";

import { OfficialSlimeSprite } from "./OfficialSlimeSprite";
import { SlimeBuffTierChip } from "./SlimeBuffTierChip";
import styles from "./SlimePetPage.module.css";
import {
  SLIME_COOKIE_ITEM_KEY,
  formatGrowthHours,
  slimeItemSpritePath,
  slimeWearablesFromItems,
  type EquippedItemsByColor,
  type WardrobeFilter,
} from "./SlimePetModel";
import {
  slimeShopItemBuffLabel,
  slimeShopPreviewState,
  slimeWardrobeItemWearerLabel,
} from "./SlimeShopPresentation";

const SLIME_TRAMPOLINE_ITEM_KEY = "slime-blue-trampoline";
const SHOP_PREVIEW_SLOT_PX = 192;

export type SlimeShopItemCardProps = {
  item: SlimeShopItem;
  wardrobe: boolean;
  wardrobeColor: SlimeColor | null;
  wardrobeFilter: WardrobeFilter;
  unitLabel: string;
  ownedItemKeys: readonly string[];
  ownedItemQuantities: Readonly<Record<string, number>>;
  equippedItemKeys: readonly string[];
  equippedItemsByColor: EquippedItemsByColor;
  hiddenItemsByColor: Partial<Record<SlimeColor, string[]>>;
  busyItemKey: string | null;
  onPurchaseItem: (item: SlimeShopItem) => void;
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
};

/** One catalog or wardrobe item card, including exact sprite preview composition. */
export function SlimeShopItemCard({
  item,
  wardrobe,
  wardrobeColor,
  wardrobeFilter,
  unitLabel,
  ownedItemKeys,
  ownedItemQuantities,
  equippedItemKeys,
  equippedItemsByColor,
  hiddenItemsByColor,
  busyItemKey,
  onPurchaseItem,
  onEquipItem,
  onToggleItemVisibility,
}: SlimeShopItemCardProps) {
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
  const wornByOther = wardrobe
    ? slimeWardrobeItemWearerLabel(
        item.key,
        wardrobeColor,
        equippedItemsByColor,
      )
    : null;
  const busy = busyItemKey === item.key;
  const preview = slimeShopPreviewState(item);
  const previewColor =
    wardrobe && (wardrobeFilter === "prop" || wardrobeFilter === "drink")
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
    : slimeShopItemBuffLabel(item);
  const isBall = item.key.startsWith("slime-ball-");
  const itemSpritePath = isBall
    ? slimeItemSpritePath(item, previewColor)
    : undefined;
  const hasScene = Boolean(
    sceneBackground || isVehicle || preview.equippedFloor !== "none",
  );

  if (wardrobe) {
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
              itemSpritePath={sceneBackground ? undefined : itemSpritePath}
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
              vehicleEffectSpritePaths={renderedVehicle?.vehicleEffectSpritePaths}
              vehicleFrameCount={renderedVehicle?.vehicleFrameCount}
              vehicleGroundedFrameCount={
                renderedVehicle?.vehicleGroundedFrameCount
              }
              vehicleGroundedFrameDurationMs={
                renderedVehicle?.vehicleGroundedFrameDurationMs
              }
              vehicleCanvasHeight={renderedVehicle?.vehicleCanvasHeight}
              vehicleCharacterOffsetY={renderedVehicle?.vehicleCharacterOffsetY}
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
              <SlimeBuffTierChip
                label={buffLabel}
                bps={item.effectBps ?? 0}
              />
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
                <SlimeBuffTierChip
                  label={buffLabel}
                  bps={item.effectBps ?? 0}
                />
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
        if (
          busy ||
          (owned && !repeatable) ||
          (event.key !== "Enter" && event.key !== " ")
        ) {
          return;
        }
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
            vehicleGroundedSpritePath={renderedVehicle?.vehicleGroundedSpritePath}
            vehicleEffectSpritePaths={renderedVehicle?.vehicleEffectSpritePaths}
            vehicleFrameCount={renderedVehicle?.vehicleFrameCount}
            vehicleGroundedFrameCount={
              renderedVehicle?.vehicleGroundedFrameCount
            }
            vehicleGroundedFrameDurationMs={
              renderedVehicle?.vehicleGroundedFrameDurationMs
            }
            vehicleCanvasHeight={renderedVehicle?.vehicleCanvasHeight}
            vehicleCharacterOffsetY={renderedVehicle?.vehicleCharacterOffsetY}
            vehicleBobY={renderedVehicle?.vehicleBobY}
            vehicleRiseY={renderedVehicle?.vehicleRiseY}
            vehicleOffsetX={renderedVehicle?.vehicleOffsetX}
            wearables={previewWearables}
            drinkFlavor={previewDrinkFlavor}
            repeat={preview.action === "drink" || isBall}
            scale={SLIME_HOME_HERO_RENDERER_SCALE}
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
            {item.price.toLocaleString("ko-KR")}
            {unitLabel}
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
}
