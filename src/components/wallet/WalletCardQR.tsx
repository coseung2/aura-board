"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  card: { id: string; cardNumber: string; status: string };
};

export function WalletCardQR({ card }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [designing, setDesigning] = useState(false);
  const [designError, setDesignError] = useState<string | null>(null);
  const fetchRef = useRef(false);

  const fetchToken = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const res = await fetch("/api/my/wallet/card-qr", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { token: string; expiresAt: null };
      setToken(data.token);
      // Generate QR image
      const { default: QRCode } = await import("qrcode");
      const url = await QRCode.toDataURL(data.token, { width: 220, margin: 1 });
      setQrDataUrl(url);
    } finally {
      fetchRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  async function handleCopy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard denied — surface token as fallback
    }
  }

  async function handleCanvaDesign() {
    if (designing) return;
    setDesigning(true);
    setDesignError(null);
    const popup = window.open("about:blank", "_blank");
    try {
      const res = await fetch("/api/my/wallet/canva-card", {
        method: "POST",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        editUrl?: string;
        connectUrl?: string;
        error?: string;
      };

      if (res.status === 401 && data.connectUrl) {
        if (popup) {
          popup.location.href = data.connectUrl;
        } else {
          window.location.href = data.connectUrl;
        }
        return;
      }

      if (!res.ok || !data.editUrl) {
        throw new Error(data.error ?? "canva_design_failed");
      }

      if (popup) {
        popup.location.href = data.editUrl;
      } else {
        window.location.href = data.editUrl;
      }
    } catch {
      popup?.close();
      setDesignError("Canva 디자인을 만들 수 없어요.");
    } finally {
      setDesigning(false);
    }
  }

  return (
    <div className="wallet-card-qr">
      <header className="wallet-card-header">
        <h3>내 카드</h3>
        <span className="wallet-card-number">{card.cardNumber}</span>
      </header>

      <div
        className="wallet-qr-frame"
        role="img"
        aria-label="고정 카드 QR 코드"
      >
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="" width={220} height={220} />
        ) : (
          <div className="wallet-qr-skeleton" />
        )}
      </div>

      <div className="wallet-qr-actions">
        <button
          type="button"
          className="wallet-qr-copy"
          onClick={handleCopy}
          disabled={!token}
        >
          {copied ? "복사됨!" : "토큰 복사"}
        </button>
        <button
          type="button"
          className="wallet-qr-canva"
          onClick={handleCanvaDesign}
          disabled={!token || designing}
        >
          {designing ? "준비 중…" : "Canva에서 카드 디자인"}
        </button>
      </div>
      {designError && (
        <p className="wallet-qr-design-error" role="alert">
          {designError}
        </p>
      )}
    </div>
  );
}
