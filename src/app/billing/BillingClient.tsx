"use client";

// 결제 UI — 현재 구독 상태 + Pro 업그레이드 + 취소 + 결제 내역(준비중) 표시.
// Toss SDK는 CDN으로 동적 로드 (npm 의존성 추가 회피).

import { useCallback, useEffect, useRef, useState } from "react";

type StatusResponse = {
  tier: "free" | "pro";
  plan: "free" | "pro_monthly" | "pro_yearly";
  status: "active" | "trial" | "past_due" | "canceled" | "paused";
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  cardLast4: string | null;
  catalog: Record<
    "pro_monthly" | "pro_yearly",
    { planKey: string; label: string; amount: number; periodDays: number }
  >;
  tossClientKey: string | null;
};

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      requestBillingAuth: (
        method: "카드",
        opts: {
          customerKey: string;
          successUrl: string;
          failUrl: string;
          customerEmail?: string;
          customerName?: string;
        },
      ) => Promise<void>;
    };
  }
}

function loadTossSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject();
  if (window.TossPayments) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.tosspayments.com/v1/payment";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("toss sdk load failed"));
    document.head.appendChild(s);
  });
}

function formatKRW(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

export function BillingClient() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const statusRequest = useRef(0);

  const loadStatus = useCallback(async () => {
    const request = ++statusRequest.current;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      if (!res.ok) throw new Error("billing_status_failed");
      const next: StatusResponse = await res.json();
      if (!next?.catalog || !["free", "pro"].includes(next.tier)) throw new Error("invalid_billing_status");
      if (request === statusRequest.current) setStatus(next);
    } catch {
      if (request === statusRequest.current) setLoadError("구독 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      if (request === statusRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("failed")) {
      setMsg("결제가 완료되지 않았습니다. 결제 수단을 확인한 뒤 다시 시도해 주세요.");
    }
    void loadStatus();
    return () => { statusRequest.current += 1; };
  }, [loadStatus]);

  async function upgrade(planKey: "pro_monthly" | "pro_yearly") {
    if (!status?.tossClientKey) {
      setMsg("결제 모듈이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg(`결제 시작 실패: ${data.error ?? res.statusText}`);
        return;
      }
      const checkout = (await res.json()) as {
        tossClientKey: string;
        customerKey: string;
        orderId: string;
        orderName: string;
        amount: number;
        planKey: string;
        customerEmail?: string;
        customerName?: string;
      };
      await loadTossSdk();
      const tp = window.TossPayments!(checkout.tossClientKey);
      const origin = window.location.origin;
      const successUrl =
        `${origin}/billing/callback?planKey=${encodeURIComponent(checkout.planKey)}` +
        `&orderId=${encodeURIComponent(checkout.orderId)}`;
      const failUrl = `${origin}/billing?failed=1`;
      await tp.requestBillingAuth("카드", {
        customerKey: checkout.customerKey,
        successUrl,
        failUrl,
        customerEmail: checkout.customerEmail,
        customerName: checkout.customerName,
      });
      // requestBillingAuth은 브라우저를 Toss로 리다이렉트하므로 여기 이후로 실행되지 않음.
    } catch (err) {
      setMsg(`오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm("구독을 취소하시겠어요? 현재 결제 기간이 끝날 때까지는 Pro 기능을 계속 사용할 수 있어요.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      if (res.ok) {
        setMsg("구독 취소가 예약되었습니다.");
        setStatus((current) => current ? { ...current, canceledAt: new Date().toISOString() } : current);
        await loadStatus();
      } else {
        setMsg("구독을 취소하지 못했습니다. 다시 시도해 주세요.");
      }
    } catch {
      setMsg("구독 취소 요청에 실패했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return <div className="billing-panel" aria-busy={loading}>
      {loadError ? <div role="alert"><p>{loadError}</p>
        <button type="button" onClick={() => void loadStatus()} disabled={loading}>다시 시도</button>
      </div> : <p role="status">불러오는 중…</p>}
    </div>;
  }

  const tossReady = !!status.tossClientKey;

  return (
    <div className="billing-panel">
      {loadError && <div role="alert"><p>{loadError}</p>
        <button type="button" onClick={() => void loadStatus()} disabled={loading}>다시 시도</button>
      </div>}
      <div className="billing-current">
        <span className={`billing-badge ${status.tier === "pro" ? "is-pro" : "is-free"}`}>
          {status.tier === "pro" ? "Pro" : "Free"}
        </span>
        <div className="billing-current-meta">
          <div>플랜: <strong>{status.plan}</strong></div>
          {status.currentPeriodEnd && (
            <div>
              {status.canceledAt ? "이용 종료일:" : "다음 결제일:"}{" "}
              <strong>{new Date(status.currentPeriodEnd).toLocaleDateString("ko-KR")}</strong>
              {status.canceledAt && <span className="billing-muted"> (취소 예약됨)</span>}
            </div>
          )}
          {status.cardLast4 && (
            <div className="billing-muted">카드 끝자리 ...{status.cardLast4}</div>
          )}
        </div>
      </div>

      {status.tier === "free" && (
        <div className="billing-plans">
          <PlanCard
            label="Pro 월 구독"
            amount={status.catalog.pro_monthly.amount}
            periodDays={status.catalog.pro_monthly.periodDays}
            disabled={busy || !tossReady}
            onClick={() => upgrade("pro_monthly")}
            note="언제든 취소 가능"
          />
          <PlanCard
            label="Pro 연 구독"
            amount={status.catalog.pro_yearly.amount}
            periodDays={status.catalog.pro_yearly.periodDays}
            disabled={busy || !tossReady}
            onClick={() => upgrade("pro_yearly")}
            note="연간 약 2개월 할인"
            highlighted
          />
        </div>
      )}

      {status.tier === "pro" && !status.canceledAt && (
        <button
          type="button"
          className="billing-cancel"
          onClick={cancel}
          disabled={busy}
        >
          구독 취소
        </button>
      )}

      {!tossReady && (
        <p className="billing-muted">
          현재 결제를 사용할 수 없습니다. 서비스 운영자에게 문의해 주세요.
        </p>
      )}

      {msg && <p className="billing-msg" role="status">{msg}</p>}
    </div>
  );
}

function PlanCard(props: {
  label: string;
  amount: number;
  periodDays: number;
  onClick: () => void;
  disabled: boolean;
  note?: string;
  highlighted?: boolean;
}) {
  return (
    <button
      type="button"
      className={`billing-plan-card ${props.highlighted ? "is-highlighted" : ""}`}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <div className="billing-plan-title">{props.label}</div>
      <div className="billing-plan-price">{formatKRW(props.amount)}</div>
      <div className="billing-plan-period">/{props.periodDays}일</div>
      {props.note && <div className="billing-plan-note">{props.note}</div>}
    </button>
  );
}
