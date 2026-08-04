"use client";

import { calculateSlimePurchaseBalanceSummary } from "@/lib/pets/slime-purchase-summary";
import type { SlimeShopItem } from "@/lib/pets/types";
import styles from "./SlimeShopCartDrawer.module.css";

export type SlimeCartLine = {
  item: SlimeShopItem;
  quantity: number;
};

type Props = {
  open: boolean;
  lines: readonly SlimeCartLine[];
  unitLabel: string;
  balance: number;
  busy: boolean;
  onClose: () => void;
  onChangeQuantity: (itemKey: string, quantity: number) => void;
  onRemove: (itemKey: string) => void;
  onCheckout: () => void;
};

export function SlimeShopCartDrawer({
  open,
  lines,
  unitLabel,
  balance,
  busy,
  onClose,
  onChangeQuantity,
  onRemove,
  onCheckout,
}: Props) {
  if (!open) return null;

  const total = lines.reduce(
    (sum, line) => sum + line.item.price * line.quantity,
    0,
  );
  const balanceSummary = calculateSlimePurchaseBalanceSummary(
    total,
    1,
    balance,
  );

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="장바구니"
        aria-busy={busy}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>장바구니</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="장바구니 닫기"
          >
            ×
          </button>
        </header>

        {lines.length === 0 ? (
          <p className={styles.empty}>담은 상품이 없어요.</p>
        ) : (
          <ul className={styles.list} aria-label="장바구니 상품">
            {lines.map((line) => (
              <li key={line.item.key} className={styles.row}>
                <div className={styles.copy}>
                  <strong>{line.item.labelKo}</strong>
                  <span>
                    {(line.item.price * line.quantity).toLocaleString()}
                    {unitLabel}
                  </span>
                </div>
                <div className={styles.controls}>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeQuantity(line.item.key, Math.max(1, line.quantity - 1))
                    }
                    disabled={busy || line.quantity <= 1}
                    aria-label={`${line.item.labelKo} 수량 줄이기`}
                  >
                    −
                  </button>
                  <output aria-label={`${line.item.labelKo} 수량`}>
                    {line.quantity}
                  </output>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeQuantity(line.item.key, line.quantity + 1)
                    }
                    disabled={busy}
                    aria-label={`${line.item.labelKo} 수량 늘리기`}
                  >
                    ＋
                  </button>
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() => onRemove(line.item.key)}
                    disabled={busy}
                    aria-label={`${line.item.labelKo} 삭제`}
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <footer className={styles.footer}>
          <div className={styles.totalRow}>
            <span>합계</span>
            <strong>
              {balanceSummary.total.toLocaleString()}
              {unitLabel}
            </strong>
          </div>
          <div className={styles.totalRow}>
            <span>현재 잔액</span>
            <strong>
              {balanceSummary.currentBalance.toLocaleString()}
              {unitLabel}
            </strong>
          </div>
          <div className={styles.totalRow} aria-live="polite">
            <span>구매 후 잔액</span>
            <strong>
              {balanceSummary.remainingBalance.toLocaleString()}
              {unitLabel}
            </strong>
          </div>
          {balanceSummary.shortOnFunds ? (
            <p role="alert">잔액이 부족해요.</p>
          ) : null}
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onClose}>
              닫기
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={onCheckout}
              disabled={busy || lines.length === 0}
            >
              {busy ? "구매 중…" : "구매하기"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
