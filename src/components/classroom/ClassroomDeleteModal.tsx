"use client";

import { useEffect, useRef, useState } from "react";

// parent-class-invite-v2 — ClassroomDeleteModal. S-T5 in phase5/design_spec.md.
// Cascade revoke warning + classroom-name re-type confirm.

export interface ClassroomDeleteModalProps {
  open: boolean;
  classroomName: string;
  pendingCount: number;
  activeCount: number;
  warningText?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export function ClassroomDeleteModal({
  open,
  classroomName,
  pendingCount,
  activeCount,
  warningText,
  onConfirm,
  onCancel,
}: ClassroomDeleteModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [echo, setEcho] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
      setEcho("");
    }
  }, [open]);

  if (!open) return null;

  const matches = echo === classroomName;
  const doConfirm = async () => {
    if (!matches) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  const affected = pendingCount + activeCount;

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="classroom-delete-title"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !submitting) onCancel();
      }}
      style={overlayStyle}
    >
      <div style={modalStyle}>
        <h2 id="classroom-delete-title" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
          학급 삭제
        </h2>
        {warningText ? (
          <div style={warningStyle}>{warningText}</div>
        ) : affected > 0 ? (
          <div style={warningStyle}>
            이 학급을 삭제하면 학부모 {affected}명의 액세스가 즉시 해제됩니다.
          </div>
        ) : null}
        <p style={{ marginTop: 16, fontSize: 15, color: "var(--color-text-muted)" }}>
          삭제를 확인하려면 학급명 <strong>{classroomName}</strong> 을 정확히 입력하세요.
        </p>
        <input
          type="text"
          value={echo}
          onChange={(e) => setEcho(e.target.value)}
          placeholder={classroomName}
          aria-label="학급명 재입력"
          style={{
            width: "100%",
            marginTop: 8,
            padding: "10px 12px",
            fontSize: 14,
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-btn)",
            background: "var(--color-surface)",
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button ref={cancelRef} type="button" disabled={submitting} onClick={onCancel} style={btnSecondary}>
            취소
          </button>
          <button
            type="button"
            disabled={!matches || submitting}
            onClick={doConfirm}
            style={{ ...btnDestructive, opacity: matches && !submitting ? 1 : 0.5 }}
          >
            {submitting ? "삭제 중..." : "삭제"}
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
  maxWidth: 460,
  width: "calc(100% - 32px)",
  padding: 24,
  background: "var(--color-surface)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card-hover)",
};
const warningStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  background: "rgba(198,40,40,0.08)",
  border: "1px solid var(--color-danger)",
  borderRadius: "var(--radius-btn)",
  color: "var(--color-danger)",
  fontSize: 14,
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
