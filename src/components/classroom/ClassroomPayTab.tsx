"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type StoreItem = {
  id: string;
  name: string;
  price: number;
  stock: number | null;
  imageUrl: string | null;
};

type Props = { classroomId: string };

type Receipt = {
  total: number;
  balance: number;
  student: { id: string; name: string; number: number | null };
  items: { id: string; name: string; price: number; qty: number }[];
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export function ClassroomPayTab({ classroomId }: Props) {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [scannerSupported, setScannerSupported] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/classrooms/${classroomId}/store/items`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { items: StoreItem[] };
    setItems(data.items);
  }, [classroomId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setScannerSupported(
      typeof window !== "undefined" &&
        typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        !!window.BarcodeDetector
    );
  }, []);

  const cartList = useMemo(
    () =>
      items
        .filter((item) => cart[item.id] && cart[item.id] > 0)
        .map((item) => ({ ...item, qty: cart[item.id] })),
    [items, cart]
  );

  const total = cartList.reduce((sum, item) => sum + item.price * item.qty, 0);

  const stopScanner = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setScannerOpen(false);
    setScannerBusy(false);
  }, []);

  useEffect(() => {
    return () => stopScanner();
  }, [stopScanner]);

  const scanLoop = useCallback(async () => {
    if (!videoRef.current || !detectorRef.current) return;
    try {
      const results = await detectorRef.current.detect(videoRef.current);
      const rawValue = results.find((result) => typeof result.rawValue === "string")?.rawValue;
      if (rawValue) {
        setToken(rawValue);
        setScannerError(null);
        stopScanner();
        return;
      }
    } catch {
      // Ignore transient decode failures while the camera settles.
    }
    rafRef.current = requestAnimationFrame(scanLoop);
  }, [stopScanner]);

  async function startScanner() {
    if (!scannerSupported || scannerBusy) return;
    setScannerBusy(true);
    setScannerError(null);
    try {
      detectorRef.current = new window.BarcodeDetector!({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setScannerOpen(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      rafRef.current = requestAnimationFrame(scanLoop);
    } catch {
      setScannerError(
        "카메라를 시작하지 못했어요. 권한을 확인하거나 아래 토큰 붙여넣기를 사용해 주세요."
      );
      stopScanner();
    }
  }

  function addToCart(id: string) {
    setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  }

  function changeQty(id: string, delta: number) {
    setCart((current) => {
      const next = (current[id] ?? 0) + delta;
      if (next <= 0) {
        const copy = { ...current };
        delete copy[id];
        return copy;
      }
      return { ...current, [id]: next };
    });
  }

  function clearCart() {
    setCart({});
    setToken("");
    setError(null);
  }

  async function handleCharge() {
    if (cartList.length === 0 || !token.trim()) {
      setError("상품과 손님 QR 토큰을 먼저 준비해 주세요.");
      return;
    }

    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/store/charge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cardQrToken: token.trim(),
          items: cartList.map((item) => ({ itemId: item.id, qty: item.qty })),
        }),
      });

      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error;
        setError(typeof msg === "string" ? msg : "결제에 실패했어요.");
        return;
      }

      const data = await res.json();
      setReceipt({
        total: data.total,
        balance: data.balance,
        student: data.student,
        items: data.items,
      });
      clearCart();
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="classroom-pay">
      <div className="pay-intro">
        <div>
          <p className="pay-intro-eyebrow">매점원 모드</p>
          <h2 className="pay-intro-title">손님 학생 QR로 결제하기</h2>
          <p className="pay-intro-copy">
            상품을 먼저 담고, 손님 학생의 QR 지갑을 카메라로 찍거나 토큰을 붙여넣어
            결제를 진행하세요.
          </p>
        </div>
        <div className="pay-intro-actions">
          <Link href={`/classroom/${classroomId}/store`} className="pay-manage-link">
            상품 관리
          </Link>
        </div>
      </div>

      <div className="pay-grid">
        <div className="pay-catalog">
          <h3>상품</h3>
          {items.length === 0 ? (
            <p className="pay-empty">등록된 상품이 없어요. 먼저 매점 상품을 준비해 주세요.</p>
          ) : (
            <ul className="pay-item-grid">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="pay-item-btn"
                    onClick={() => addToCart(item.id)}
                    disabled={item.stock === 0}
                  >
                    {item.imageUrl && <img src={item.imageUrl} alt="" width={120} height={80} />}
                    <div className="pay-item-name">{item.name}</div>
                    <div className="pay-item-price">{item.price.toLocaleString()}원</div>
                    {item.stock !== null && <div className="pay-item-stock">재고 {item.stock}</div>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="pay-cart">
          <div className="pay-cart-header">
            <h3>결제 바구니</h3>
            <span className="pay-cart-total">{total.toLocaleString()}원</span>
          </div>

          {cartList.length === 0 ? (
            <p className="pay-cart-empty">아직 담긴 상품이 없어요.</p>
          ) : (
            <ul className="pay-cart-list">
              {cartList.map((item) => (
                <li key={item.id} className="pay-cart-row">
                  <span className="pay-cart-name">{item.name}</span>
                  <div className="pay-cart-qty">
                    <button type="button" onClick={() => changeQty(item.id, -1)}>
                      -
                    </button>
                    <span>{item.qty}</span>
                    <button type="button" onClick={() => changeQty(item.id, 1)}>
                      +
                    </button>
                  </div>
                  <span className="pay-cart-sub">
                    {(item.price * item.qty).toLocaleString()}원
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="pay-scanner-actions">
            <button
              type="button"
              className="pay-scan-btn"
              onClick={() => void startScanner()}
              disabled={!scannerSupported || scannerBusy}
            >
              {scannerOpen ? "스캔 중..." : "카메라로 QR 찍기"}
            </button>
            {!scannerSupported && (
              <p className="pay-scan-help">
                이 브라우저에서는 카메라 QR 스캔을 지원하지 않아요. 아래에 토큰을
                붙여넣어 주세요.
              </p>
            )}
            {scannerError && <p className="pay-error">{scannerError}</p>}
          </div>

          {scannerOpen && (
            <div className="pay-scanner-panel">
              <video
                ref={videoRef}
                className="pay-scanner-video"
                muted
                playsInline
                autoPlay
              />
              <div className="pay-scanner-footer">
                <span>QR을 화면 안쪽에 맞춰 주세요.</span>
                <button type="button" className="pay-scanner-stop" onClick={stopScanner}>
                  닫기
                </button>
              </div>
            </div>
          )}

          <label className="pay-token-field">
            <span>손님 학생 카드 QR 토큰</span>
            <textarea
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="QR 스캐너가 읽은 값을 그대로 넣거나, 학생 지갑의 토큰을 붙여넣으세요."
              rows={3}
              disabled={busy}
            />
          </label>

          {error && <p className="pay-error">{error}</p>}

          <div className="pay-cart-actions">
            <button
              type="button"
              className="pay-cart-clear"
              onClick={clearCart}
              disabled={busy || cartList.length === 0}
            >
              비우기
            </button>
            <button
              type="button"
              className="pay-cart-charge"
              onClick={handleCharge}
              disabled={busy || cartList.length === 0 || !token.trim()}
            >
              {busy ? "결제 처리 중..." : `${total.toLocaleString()}원 결제`}
            </button>
          </div>
        </aside>
      </div>

      {receipt && (
        <div
          className="modal-backdrop"
          onClick={() => setReceipt(null)}
          role="dialog"
          aria-modal="true"
          aria-label="결제 완료"
        >
          <div className="pay-receipt" onClick={(event) => event.stopPropagation()}>
            <h3>결제 완료</h3>
            <p>
              <strong>{receipt.student.name}</strong> 학생의 결제를 마쳤어요. 남은 잔고는{" "}
              <strong>{receipt.balance.toLocaleString()}원</strong>입니다.
            </p>
            <ul className="pay-receipt-items">
              {receipt.items.map((item) => (
                <li key={item.id}>
                  {item.name} x {item.qty} = {(item.price * item.qty).toLocaleString()}원
                </li>
              ))}
            </ul>
            <div className="pay-receipt-total">총합 {receipt.total.toLocaleString()}원</div>
            <button
              type="button"
              className="pay-receipt-close"
              onClick={() => setReceipt(null)}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
