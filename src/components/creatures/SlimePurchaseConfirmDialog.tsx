"use client";

import { useEffect, useId, useRef, useState } from "react";
import { OfficialSlimeSprite } from "./OfficialSlimeSprite";
import { SLIME_COOKIE_ITEM_KEY } from "./SlimePetModel";
import { SLIME_MAX_PURCHASE_QUANTITY } from "@/lib/pets/catalog";
import type { SlimeColor, SlimeShopItem } from "@/lib/pets/types";
import styles from "./SlimePurchaseConfirmDialog.module.css";

const COLOR_LABELS: Record<SlimeColor, string> = {
  blue: "블루",
  green: "그린",
  yellow: "옐로",
  purple: "퍼플",
  red: "레드",
};

type Props = {
  item: SlimeShopItem;
  /** Colors the student owns, used as the preview carousel pages. */
  previewColors: readonly SlimeColor[];
  balance: number;
  unitLabel: string;
  busy: boolean;
  onCancel: () => void;
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
  onConfirm,
}: Props) {
  const titleId = useId();
  const supportsQuantity = item.key === SLIME_COOKIE_ITEM_KEY;
  const [quantity, setQuantity] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const colors = previewColors.length > 0 ? previewColors : (["blue"] as const);
  const activeColor = colors[Math.min(pageIndex, colors.length - 1)] ?? "blue";
  const total = item.price * quantity;
  /**
   * Advisory only. The wallet check that actually protects the ledger runs
   * server-side, so a stale client balance must never be the reason a student
   * cannot complete a purchase.
   */
  const shortOnFunds = total > balance;

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
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {item.labelKo}
          </h2>
          <p className={styles.price}>
            {item.price.toLocaleString()}
            {unitLabel}
          </p>
        </header>

        <section className={styles.previewArea} aria-label="펫 미리보기">
          <button
            type="button"
            className={styles.arrow}
            onClick={() => setPageIndex((index) => (index - 1 + colors.length) % colors.length)}
            disabled={colors.length <= 1}
            aria-label="이전 펫 미리보기"
          >
            ‹
          </button>
          <div className={styles.preview}>
            <OfficialSlimeSprite
              slimeColor={activeColor}
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
            ›
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
          <span className={styles.rowLabel}>합계</span>
          <strong className={styles.total}>
            {total.toLocaleString()}
            {unitLabel}
          </strong>
        </div>

        {shortOnFunds ? (
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
