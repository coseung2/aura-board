"use client";

import { useEffect, useRef, useState } from "react";

// parent-class-invite-v2 — RotateConfirmModal. S-T4 in phase5/design_spec.md.

export interface RotateConfirmModalProps {
  open: boolean;
  pendingCount: number;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export function RotateConfirmModal({ open, pendingCount, onConfirm, onCancel }: RotateConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="rotate-modal-title"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !submitting) onCancel();
      }}
      style={overlayStyle}
    >
      <div style={modalStyle}>
        <h2 id="rotate-modal-title" style={{ margin: "0 0 12px 0", fontSize: 20, fontWeight: 700 }}>
          초대 코드 재발급
        </h2>
        <p style={{ margin: 0, fontSize: 15, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
          재발급하면 기존 코드는 즉시 무효화되고 승인 대기 중인 {pendingCount}명은 자동으로
          거부됩니다. 계속할까요?
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
          <button
            ref={cancelRef}
            type="button"
            disabled={submitting}
            onClick={onCancel}
            style={btnSecondary}
          >
            취소
          </button>
          <button type="button" disabled={submitting} onClick={handleConfirm} style={btnDestructive}>
            {submitting ? "재발급 중..." : "재발급"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};
const modalStyle: React.CSSProperties = {
  maxWidth: 420,
  width: "calc(100% - 32px)",
  padding: 24,
  background: "var(--color-surface)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card-hover)",
};
const btnSecondary: React.CSSProperties = {
  minHeight: 44,
  padding: "10px 16px",
  borderRadius: "var(--radius-btn)",
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
const btnDestructive: React.CSSProperties = {
  minHeight: 44,
  padding: "10px 16px",
  borderRadius: "var(--radius-btn)",
  border: "none",
  background: "var(--color-danger)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
