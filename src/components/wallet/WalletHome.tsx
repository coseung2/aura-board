"use client";

import { useCallback, useEffect, useState } from "react";
import { WalletCardQR } from "./WalletCardQR";

type FD = {
  id: string;
  principal: number;
  monthlyRate: number;
  startDate: string;
  maturityDate: string;
};

type Transaction = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
};

type WalletData = {
  studentName: string;
  classroomId: string;
  balance: number;
  currency: { unitLabel: string; monthlyInterestRate: number | null };
  card: { id: string; cardNumber: string; status: string } | null;
  activeFDs: FD[];
  recentTransactions: Transaction[];
};

const TYPE_LABEL: Record<string, string> = {
  deposit: "입금",
  withdraw: "출금",
  purchase: "결제",
  refund: "환불",
  fd_open: "적금 가입",
  fd_matured: "적금 만기",
  fd_cancelled: "적금 해지",
  avatar_purchase: "캐릭터 상점 구매",
};

export function WalletHome() {
  const [data, setData] = useState<WalletData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingFD, setCancellingFD] = useState<string | null>(null);
  const [fdError, setFdError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/my/wallet", { cache: "no-store" });
      if (!res.ok) {
        setError("통장 정보를 불러올 수 없어요");
        return;
      }
      const payload = (await res.json()) as WalletData;
      setData(payload);
      setError(null);
    } catch {
      setError("네트워크 오류");
    }
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(load, 15_000); // 15초마다 백그라운드 새로고침
    return () => clearInterval(i);
  }, [load]);

  async function handleCancelFD(fdId: string) {
    if (!data) return;
    if (!window.confirm("이 적금을 중도해지할까요? (이자 없이 원금만 반환)")) {
      return;
    }
    setCancellingFD(fdId);
    setFdError(null);
    try {
      const res = await fetch(
        `/api/classrooms/${data.classroomId}/bank/fixed-deposits/${fdId}/cancel`,
        { method: "POST" }
      );
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error;
        setFdError(typeof msg === "string" ? msg : "해지에 실패했어요");
        return;
      }
      await load();
    } finally {
      setCancellingFD(null);
    }
  }

  if (error) {
    return <p className="wallet-error">{error}</p>;
  }
  if (!data) {
    return <p className="wallet-loading">불러오는 중…</p>;
  }
  const unit = data.currency.unitLabel;

  return (
    <div className="wallet-home">
      <header className="wallet-header">
        <h1>🏦 {data.studentName}님 통장</h1>
        <div className="wallet-balance">
          <div className="wallet-balance-label">현재 잔액</div>
          <div className="wallet-balance-value">
            {data.balance.toLocaleString()} {unit}
          </div>
        </div>
      </header>

      <div className="wallet-grid">
        <section className="wallet-card-section">
          {data.card ? (
            <WalletCardQR card={data.card} />
          ) : (
            <p className="wallet-card-missing">카드가 발급되지 않았어요.</p>
          )}
        </section>

        <section className="wallet-txn-section">
          <h3>최근 거래</h3>
          {data.recentTransactions.length === 0 ? (
            <p className="wallet-txn-empty">아직 거래가 없어요.</p>
          ) : (
            <ul className="wallet-txn-list">
              {data.recentTransactions.map((t) => {
                const sign =
                  t.type === "deposit" ||
                  t.type === "fd_matured" ||
                  t.type === "fd_cancelled"
                    ? "+"
                    : "-";
                return (
                  <li key={t.id} className={`wallet-txn-row wallet-txn-${t.type}`}>
                    <span className="wallet-txn-type">
                      {TYPE_LABEL[t.type] ?? t.type}
                    </span>
                    <span className="wallet-txn-amount">
                      {sign}
                      {t.amount.toLocaleString()} {unit}
                    </span>
                    {t.note && <span className="wallet-txn-note">{t.note}</span>}
                    <span className="wallet-txn-time">
                      {new Date(t.createdAt).toLocaleString("ko-KR", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {data.activeFDs.length > 0 && (
        <section className="wallet-fd-section">
          <h3>진행중 적금</h3>
          <ul className="wallet-fd-list">
            {data.activeFDs.map((fd) => {
              const maturity = new Date(fd.maturityDate);
              const daysLeft = Math.max(
                0,
                Math.ceil((maturity.getTime() - Date.now()) / 86400000)
              );
              const projected =
                fd.principal + Math.floor(fd.principal * (fd.monthlyRate / 100));
              const isCancelling = cancellingFD === fd.id;
              return (
                <li key={fd.id} className="wallet-fd-card">
                  <div className="wallet-fd-label">적금</div>
                  <div className="wallet-fd-principal">
                    {fd.principal.toLocaleString()} {unit}
                  </div>
                  <div className="wallet-fd-meta">
                    이자 {fd.monthlyRate}% · D-{daysLeft}
                  </div>
                  <div className="wallet-fd-projected">
                    만기 수령 예상 {projected.toLocaleString()} {unit}
                  </div>
                  <button
                    type="button"
                    className="wallet-fd-cancel"
                    onClick={() => handleCancelFD(fd.id)}
                    disabled={isCancelling || cancellingFD !== null}
                  >
                    {isCancelling ? "해지 중…" : "중도해지"}
                  </button>
                </li>
              );
            })}
          </ul>
          {fdError && (
            <p className="wallet-fd-error" role="alert">
              {fdError}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
