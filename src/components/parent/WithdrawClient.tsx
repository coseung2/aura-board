"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// PV-11 — client-side confirm button for /parent/account/withdraw.
//
// Uses a native confirm() dialog (no extra modal library) since the flow is
// terminal + irreversible + mobile-first. On success we hard-navigate to
// /parent/logged-out so authenticated parent UI + watchdog unmount cleanly.

export function WithdrawClient() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = async () => {
    if (!confirm("정말 탈퇴하시겠어요? 모든 연결이 즉시 해제됩니다.")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/parent/account/withdraw", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      router.replace("/parent/logged-out?withdrawn=1");
    } catch (e) {
      console.error("[WithdrawClient]", e);
      setErr("탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 20 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        style={{
          width: "100%",
          padding: 14,
          background: busy ? "var(--color-surface-muted, #f9fafb)" : "var(--color-danger, #dc2626)",
          color: busy ? "var(--color-text-muted, #6b7280)" : "#fff",
          border: 0,
          borderRadius: 10,
          fontWeight: 600,
          fontSize: 14,
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "탈퇴 처리 중…" : "탈퇴 확정"}
      </button>
      {err ? (
        <p
          style={{
            marginTop: 8,
            color: "var(--color-danger, #dc2626)",
            fontSize: 12,
          }}
        >
          {err}
        </p>
      ) : null}
    </div>
  );
}
