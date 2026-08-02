"use client";

import { useEffect, useRef } from "react";
import styles from "./game-platform.module.css";

export type GameExitDialogProps = {
  open: boolean;
  title?: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  disabledReason?: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export function GameExitDialog({
  open,
  title = "게임에서 나갈까요?",
  description,
  confirmLabel,
  cancelLabel = "계속하기",
  busy = false,
  disabledReason,
  onConfirm,
  onCancel,
}: GameExitDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [busy, onCancel, open]);

  if (!open) return null;
  return (
    <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="game-exit-title">
        <h2 id="game-exit-title">{title}</h2>
        <p>{description}</p>
        {disabledReason ? <p className={styles.disabledReason}>{disabledReason}</p> : null}
        <div className={styles.resultActions}>
          <button
            ref={cancelRef}
            type="button"
            className={styles.secondaryButton}
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={styles.dangerButton}
            disabled={busy || Boolean(disabledReason)}
            onClick={() => void onConfirm()}
          >
            {busy ? "처리 중…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
