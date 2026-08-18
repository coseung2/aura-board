"use client";

import type { Notice } from "./SlimePetModel";
import { styles } from "./SlimePetPage.styles";

type SlimeNoticeHostProps = {
  notices: readonly Notice[];
  onDismiss: (notice: Notice) => void;
};

/** Shared fixed toast host for pet-management and shop mutation feedback. */
export function SlimeNoticeHost({
  notices,
  onDismiss,
}: SlimeNoticeHostProps) {
  if (notices.length === 0) return null;

  return (
    <div className={styles.petToastHost} aria-live="polite">
      {notices.map((notice) => (
        <div
          key={`${notice.kind}:${notice.text}`}
          className={`${styles.petToast} ${notice.kind === "error" ? styles.petToastError : ""}`.trim()}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          <span className={styles.petToastText}>{notice.text}</span>
          <button
            type="button"
            className={styles.petToastClose}
            aria-label="알림 닫기"
            onClick={() => onDismiss(notice)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
