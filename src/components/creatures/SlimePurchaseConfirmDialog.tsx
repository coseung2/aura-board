"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { OfficialSlimeSprite } from "./OfficialSlimeSprite";
import {
  SLIME_COOKIE_ITEM_KEY,
  slimeItemSpritePath,
  slimeWearablesFromItems,
} from "./SlimePetModel";
import {
  isSlimeSceneBackground,
  SLIME_MAX_PURCHASE_QUANTITY,
  slimeShopPreviewColor,
} from "@/lib/pets/catalog";
import { calculateSlimePurchaseBalanceSummary } from "@/lib/pets/slime-purchase-summary";
import type { SlimeColor, SlimeShopItem } from "@/lib/pets/types";
import styles from "./SlimePurchaseConfirmDialog.module.css";

const COLOR_LABELS: Record<SlimeColor, string> = {
  blue: "블루",
  green: "그린",
  yellow: "옐로",
  purple: "퍼플",
  red: "레드",
};

const SLIME_TRAMPOLINE_ITEM_KEY = "slime-blue-trampoline";

type Props = {
  item: SlimeShopItem;
  /** Colors the student owns, used as the preview carousel pages. */
  previewColors: readonly SlimeColor[];
  balance: number;
  unitLabel: string;
  busy: boolean;
  onCancel: () => void;
  onAddToCart?: (quantity: number) => void;
  onConfirm: (quantity: number) => void;
};

/**
 * Confirmation step for a shop purchase.
 *
 * Quantity is offered only for consumables. Every other item is owned once per
 * student and merely equipped per slime, so buying two would charge for
 * something the student can never receive twice.
 */
export function SlimePurchaseConfirmDialog({
  item,
  previewColors,
  balance,
  unitLabel,
  busy,
  onCancel,
  onAddToCart,
  onConfirm,
}: Props) {
  const titleId = useId();
  const balanceSummaryId = useId();
  const supportsQuantity = item.key === SLIME_COOKIE_ITEM_KEY;
  const [quantity, setQuantity] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const colors = previewColors.length > 0 ? previewColors : (["blue"] as const);
  const activeColor = colors[Math.min(pageIndex, colors.length - 1)] ?? "blue";
  const previewColor = slimeShopPreviewColor(item, activeColor);
  const wearables = slimeWearablesFromItems([item]);
  const isDrink = item.category === "drink";
  const isFood = item.category === "food";
  const isBall = item.key.startsWith("slime-ball-");
  const isVehicle = item.category === "vehicle" || item.category === "ride";
  const usesTrampoline = item.key === SLIME_TRAMPOLINE_ITEM_KEY;
  const renderedVehicle = isVehicle && !usesTrampoline ? item : null;
  const sceneBackground = isSlimeSceneBackground(item);
  const equippedFloor = usesTrampoline ? "trampoline" : item.floor ?? "none";
  const hasScene = Boolean(sceneBackground || isVehicle || equippedFloor !== "none");
  const itemSpritePath = isBall
    ? slimeItemSpritePath(item, previewColor)
    : undefined;
  /**
   * Advisory only. The wallet check that actually protects the ledger runs
   * server-side, so a stale client balance must never be the reason a student
   * cannot complete a purchase.
   */
  const balanceSummary = calculateSlimePurchaseBalanceSummary(
    item.price,
    quantity,
    balance,
  );

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const maxQuantity = supportsQuantity ? SLIME_MAX_PURCHASE_QUANTITY : 1;

  const step = (delta: number) => {
    setQuantity((current) => Math.min(maxQuantity, Math.max(1, current + delta)));
  };

  return (
    <div className={styles.backdrop} role="presentation" onClick={onCancel}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={balanceSummaryId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {item.labelKo}
          </h2>
        </header>

        <section
          className={`${styles.previewArea} ${hasScene ? styles.previewAreaScene : ""}`.trim()}
          style={sceneBackground
            ? { backgroundImage: `url("${item.spritePath}")` }
            : undefined}
          aria-label="펫 미리보기"
        >
          <button
            type="button"
            className={styles.arrow}
            onClick={() => setPageIndex((index) => (index - 1 + colors.length) % colors.length)}
            disabled={colors.length <= 1}
            aria-label="이전 펫 미리보기"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <div className={`${styles.preview} ${hasScene ? styles.previewScene : ""}`.trim()}>
            <OfficialSlimeSprite
              slimeColor={previewColor}
              evolution="base"
              action={
                usesTrampoline
                  ? "floor-interaction"
                  : isDrink
                    ? "drink"
                    : isFood
                      ? "happy"
                      : "idle"
              }
              equippedFloor={equippedFloor}
              itemSpritePath={itemSpritePath}
              expandSceneSurfaces={sceneBackground}
              vehicleSpritePath={renderedVehicle?.vehicleSheetPath ?? renderedVehicle?.spritePath}
              vehicleGroundedSpritePath={renderedVehicle?.vehicleGroundedSpritePath}
              vehicleEffectSpritePaths={renderedVehicle?.vehicleEffectSpritePaths}
              vehicleFrameCount={renderedVehicle?.vehicleFrameCount}
              vehicleGroundedFrameCount={renderedVehicle?.vehicleGroundedFrameCount}
              vehicleGroundedFrameDurationMs={renderedVehicle?.vehicleGroundedFrameDurationMs}
              vehicleCanvasHeight={renderedVehicle?.vehicleCanvasHeight}
              vehicleCharacterOffsetY={renderedVehicle?.vehicleCharacterOffsetY}
              vehicleBobY={renderedVehicle?.vehicleBobY}
              vehicleRiseY={renderedVehicle?.vehicleRiseY}
              vehicleOffsetX={renderedVehicle?.vehicleOffsetX}
              wearables={wearables}
              drinkFlavor={isDrink ? wearables.drink ?? null : null}
              repeat={isDrink || isBall}
              scale={3}
              alt={`${COLOR_LABELS[activeColor]} 슬라임에 ${item.labelKo} 미리보기`}
            />
            <p className={styles.previewLabel}>{COLOR_LABELS[activeColor]} 슬라임</p>
          </div>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => setPageIndex((index) => (index + 1) % colors.length)}
            disabled={colors.length <= 1}
            aria-label="다음 펫 미리보기"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </section>

        <ol className={styles.dots} aria-label={`보유 펫 ${colors.length}마리`}>
          {colors.map((color, index) => (
            <li
              key={color}
              className={index === pageIndex ? styles.dotActive : styles.dot}
              aria-current={index === pageIndex ? "true" : undefined}
            >
              <span className={styles.srOnly}>{COLOR_LABELS[color]}</span>
            </li>
          ))}
        </ol>

        {supportsQuantity ? (
          <div className={styles.quantityRow}>
            <span className={styles.rowLabel}>수량</span>
            <div className={styles.stepper}>
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={quantity <= 1 || busy}
                aria-label="수량 줄이기"
              >
                −
              </button>
              <output aria-label="구매 수량">{quantity}</output>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={quantity >= maxQuantity || busy}
                aria-label="수량 늘리기"
              >
                ＋
              </button>
            </div>
          </div>
        ) : null}

        <div className={styles.totalRow}>
          <span className={styles.rowLabel}>금액</span>
          <strong className={styles.total}>
            {balanceSummary.total.toLocaleString()}
            {unitLabel}
          </strong>
        </div>

        <div className={styles.totalRow}>
          <span className={styles.rowLabel}>현재 잔액</span>
          <strong className={styles.total}>
            {balanceSummary.currentBalance.toLocaleString()}
            {unitLabel}
          </strong>
        </div>

        <div id={balanceSummaryId} className={styles.totalRow}>
          <span className={styles.rowLabel}>구매 후 잔액</span>
          <strong className={styles.total} aria-live="polite">
            {balanceSummary.remainingBalance.toLocaleString()}
            {unitLabel}
          </strong>
        </div>

        {balanceSummary.shortOnFunds ? (
          <p className={styles.warning} role="alert">
            잔액이 부족해요.
          </p>
        ) : null}

        <footer className={styles.footer}>
          <button
            type="button"
            ref={cancelRef}
            className={styles.cancel}
            onClick={onCancel}
            disabled={busy}
          >
            취소
          </button>
          {onAddToCart ? (
            <button
              type="button"
              className={styles.cart}
              onClick={() => onAddToCart(quantity)}
              disabled={busy}
            >
              장바구니 담기
            </button>
          ) : null}
          <button
            type="button"
            className={styles.confirm}
            onClick={() => onConfirm(quantity)}
            disabled={busy}
          >
            {busy ? "구매 중…" : "구매하기"}
          </button>
        </footer>
      </div>
    </div>
  );
}
