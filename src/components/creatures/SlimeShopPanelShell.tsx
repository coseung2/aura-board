"use client";

import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";

import { styles } from "./SlimePetPage.styles";

type SlimeShopPanelShellProps = {
  presentation: "modal" | "inline";
  wardrobe: boolean;
  wardrobeName: string;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  onClose?: () => void;
  children: ReactNode;
};

/** Owns the inline region or accessible modal portal around shop content. */
export function SlimeShopPanelShell({
  presentation,
  wardrobe,
  wardrobeName,
  closeButtonRef,
  onClose,
  children,
}: SlimeShopPanelShellProps) {
  const content = (
    <>
      {presentation === "modal" ? (
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>
              {wardrobe ? "SLIME DRESS UP" : "SLIME SHOP"}
            </p>
            <h2 id="slime-modal-title">
              {wardrobe ? `${wardrobeName} 꾸미기` : "슬라임 상점"}
            </h2>
            {wardrobe ? (
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
            aria-label={wardrobe ? "꾸미기 닫기" : "상점 닫기"}
          >
            ×
          </button>
        </div>
      ) : null}
      {children}
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
