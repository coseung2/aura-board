"use client";

import { useState } from "react";
import { formatCodeForDisplay } from "@/lib/class-invite-codes-shared";
import { useToast } from "@/components/ui/Toast";

// parent-class-invite-v2 — InviteCodeCard.
// Renders the active code, QR placeholder, copy button, and rotate CTA.
// QR rendering is intentionally deferred to phase8 — the server only ships
// the code string; producing a PNG from `qrcode` npm happens at the call site
// if/when needed. For phase7 we render a QR placeholder with the code url.

export interface InviteCodeCardProps {
  code: string;
  qrJoinUrl: string;
  issuedAt: string;
  usage?: number;
  onRotate: () => void;
}

export function InviteCodeCard({ code, qrJoinUrl, issuedAt, usage, onRotate }: InviteCodeCardProps) {
  const toast = useToast();
  const [copying, setCopying] = useState(false);

  const copy = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(code);
      toast.show({ variant: "success", message: "코드를 복사했습니다" });
    } catch {
      toast.show({ variant: "error", message: "복사에 실패했습니다. 수동으로 복사해 주세요." });
    } finally {
      setCopying(false);
    }
  };

  return (
    <div>
      <div
        aria-live="polite"
        style={{
          fontSize: 28,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          fontWeight: 700,
          textAlign: "center",
          marginBottom: 12,
          letterSpacing: 2,
        }}
      >
        {formatCodeForDisplay(code)}
      </div>
      <div
        aria-label={`학부모 가입 URL: ${qrJoinUrl}`}
        style={{
          margin: "0 auto 12px",
          width: 192,
          height: 192,
          background: "var(--color-surface-alt)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          color: "var(--color-text-muted)",
          textAlign: "center",
          padding: 8,
        }}
      >
        QR은 배포 후 렌더됩니다
      </div>
      <div style={{ fontSize: 13, color: "var(--color-text-muted)", textAlign: "center" }}>
        발급: {new Date(issuedAt).toLocaleString("ko-KR")}
        {typeof usage === "number" && ` · 누적 ${usage}회 사용`}
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
        <button
          type="button"
          onClick={copy}
          disabled={copying}
          style={{
            minHeight: 44,
            padding: "10px 16px",
            borderRadius: "var(--radius-btn)",
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          복사
        </button>
        <button
          type="button"
          onClick={onRotate}
          style={{
            minHeight: 44,
            padding: "10px 16px",
            borderRadius: "var(--radius-btn)",
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          재발급
        </button>
      </div>
    </div>
  );
}
