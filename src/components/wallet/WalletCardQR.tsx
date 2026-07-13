"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  card: { id: string; cardNumber: string; status: string };
};

export function WalletCardQR({ card }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
      </div>
    </div>
  );
}
