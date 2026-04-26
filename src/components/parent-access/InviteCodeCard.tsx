"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { formatCodeForDisplay } from "@/lib/class-invite-codes-shared";
import { useToast } from "@/components/ui/Toast";

// parent-class-invite-v2 — InviteCodeCard.
// qr-render (2026-04-26): phase7 placeholder ("QR은 배포 후 렌더됩니다") 를
// 실제 QR 로 교체. `qrcode` npm 이 이미 설치돼 있어 useEffect 에서 dataURL
// 생성. qrJoinUrl 은 path-only 라 origin 결합해서 완성 URL 인코딩.

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
  const [qrSrc, setQrSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fullUrl = new URL(qrJoinUrl, window.location.origin).toString();
    QRCode.toDataURL(fullUrl, { margin: 1, width: 192, errorCorrectionLevel: "M" })
      .then((src) => {
        if (!cancelled) setQrSrc(src);
      })
      .catch(() => {
        /* render fallback below */
      });
    return () => {
      cancelled = true;
    };
  }, [qrJoinUrl]);

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
        aria-label={`학부모 가입 URL QR: ${qrJoinUrl}`}
        style={{
          margin: "0 auto 12px",
          width: 192,
          height: 192,
          background: "var(--color-surface)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {qrSrc ? (
          <img
            src={qrSrc}
            alt="학부모 가입 QR 코드"
            width={192}
            height={192}
            style={{ display: "block" }}
          />
        ) : (
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>QR 생성 중...</span>
        )}
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
