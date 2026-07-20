"use client";

import { useCallback, useEffect, useState } from "react";
import { getSlimeDefinition, getSlimeShopItem } from "@/lib/pets/catalog";
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
  creature_egg_purchase: "펫 알 구매",
  creature_item_purchase: "펫 아이템 구매",
  slime_purchase: "슬라임 구매",
  slime_item_purchase: "슬라임 아이템 구매",
  correction_credit: "정정 입금",
  correction_debit: "정정 출금",
};

const TRANSACTIONS_PER_PAGE = 10;

function formatTransactionNote(note: string): string {
  const separatorIndex = note.indexOf(":");
  if (separatorIndex === -1) return note.normalize("NFC");

  const action = note.slice(0, separatorIndex);
  const itemKey = note.slice(separatorIndex + 1);

  if (action === "slime-purchase" || action === "slime-refund") {
    const slime = getSlimeDefinition(itemKey);
    if (slime) {
      return `${slime.nameKo} ${action === "slime-refund" ? "환불" : "구매"}`;
    }
  }

  if (action === "slime-item-purchase" || action === "slime-item-refund") {
    const item = getSlimeShopItem(itemKey);
    if (item) {
      return `${item.labelKo} ${action === "slime-item-refund" ? "환불" : "구매"}`;
    }
  }

  return note.normalize("NFC");
}

function stripRewardAchievementDate(type: string, note: string | null) {
  if (type !== "deposit" || !note?.includes("보상")) return null;

  const match = note.match(/\s*\[(\d{4})-(\d{2})-(\d{2})\]\s*$/);
  if (!match) return null;

  const [, year, month, day] = match;
  return {
    note: note.slice(0, match.index).trimEnd(),
    achievementDateLabel: `${Number(year)}. ${Number(month)}. ${Number(day)}.`,
  };
}

function formatTransactionDateTime(createdAt: string) {
  return new Date(createdAt).toLocaleString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function WalletHome() {
  const [data, setData] = useState<WalletData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingFD, setCancellingFD] = useState<string | null>(null);
  const [fdError, setFdError] = useState<string | null>(null);
  const [fdPrincipal, setFdPrincipal] = useState("");
  const [openingFD, setOpeningFD] = useState(false);
  const [fdNotice, setFdNotice] = useState<string | null>(null);
  const [transactionPage, setTransactionPage] = useState(1);

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

  useEffect(() => {
    if (!data) return;
    const totalPages = Math.max(
      1,
      Math.ceil(data.recentTransactions.length / TRANSACTIONS_PER_PAGE),
    );
    setTransactionPage((currentPage) => Math.min(currentPage, totalPages));
  }, [data]);

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

  async function handleOpenFD() {
    if (!data || openingFD) return;
    const principal = Number(fdPrincipal.replace(/,/g, ""));
    if (!Number.isInteger(principal) || principal <= 0) {
      setFdError("가입 금액은 1 이상 정수로 입력하세요.");
      return;
    }
    setOpeningFD(true);
    setFdError(null);
    setFdNotice(null);
    try {
      const res = await fetch(
        `/api/classrooms/${data.classroomId}/bank/fixed-deposits`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ principal }),
        },
      );
      if (!res.ok) {
        const message = (await res.json().catch(() => ({}))).error;
        setFdError(typeof message === "string" ? message : "적금 가입에 실패했어요.");
        return;
      }
      setFdPrincipal("");
      setFdNotice("적금에 가입했어요.");
      await load();
    } finally {
      setOpeningFD(false);
    }
  }

  if (error) {
    return <p className="wallet-error">{error}</p>;
  }
  if (!data) {
    return <p className="wallet-loading">불러오는 중…</p>;
  }
  const unit = data.currency.unitLabel;
  const transactionPageCount = Math.ceil(
    data.recentTransactions.length / TRANSACTIONS_PER_PAGE,
  );
  const visibleTransactions = data.recentTransactions.slice(
    (transactionPage - 1) * TRANSACTIONS_PER_PAGE,
    transactionPage * TRANSACTIONS_PER_PAGE,
  );

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
            <>
            <ul className="wallet-txn-list">
              {visibleTransactions.map((t) => {
                const rewardAchievement = stripRewardAchievementDate(t.type, t.note);
                const transactionNote = t.note
                  ? formatTransactionNote(rewardAchievement?.note ?? t.note)
                  : null;
                const fixedDepositNote =
                  t.type === "fd_matured"
                    ? transactionNote?.match(/^(.*?)\s+(\([^)]*\))$/)
                    : null;
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
                    {t.note && (
                      <span className="wallet-txn-note">
                        {fixedDepositNote ? (
                          <>
                            <span>{fixedDepositNote[1]}</span>
                            <span className="wallet-txn-note-detail">
                              {fixedDepositNote[2]}
                            </span>
                          </>
                        ) : (
                          transactionNote
                        )}
                      </span>
                    )}
                    <span className="wallet-txn-time">
                      {rewardAchievement ? (
                        <>
                          <span className="wallet-txn-achieved-at">
                            달성 {rewardAchievement.achievementDateLabel}
                          </span>
                          <span className="wallet-txn-paid-at">
                            지급 {formatTransactionDateTime(t.createdAt)}
                          </span>
                        </>
                      ) : (
                        formatTransactionDateTime(t.createdAt)
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {transactionPageCount > 1 ? (
              <nav className="wallet-txn-pagination" aria-label="거래 기록 페이지">
                {Array.from({ length: transactionPageCount }, (_, index) => {
                  const page = index + 1;
                  const isCurrent = page === transactionPage;
                  return (
                    <button
                      key={page}
                      type="button"
                      className={isCurrent ? "is-current" : undefined}
                      aria-current={isCurrent ? "page" : undefined}
                      aria-label={`${page}페이지`}
                      onClick={() => setTransactionPage(page)}
                    >
                      {page}
                    </button>
                  );
                })}
              </nav>
            ) : null}
            </>
          )}
        </section>
      </div>

      <section className="wallet-fd-section">
        <h3>적금</h3>
        {data.currency.monthlyInterestRate === null ? (
          <p className="wallet-fd-empty">현재 가입 가능한 적금 상품이 없어요.</p>
        ) : (
          <div className="wallet-fd-open">
            <div>
              <strong>30일 적금</strong>
              <span>월 이자율 {data.currency.monthlyInterestRate}%</span>
            </div>
            <label>
              <span>가입 금액</span>
              <input
                type="text"
                inputMode="numeric"
                value={fdPrincipal}
                onChange={(event) => setFdPrincipal(event.target.value.replace(/[^\d,]/g, ""))}
                placeholder="0"
                disabled={openingFD}
              />
            </label>
            <button type="button" onClick={() => void handleOpenFD()} disabled={openingFD}>
              {openingFD ? "가입 중…" : "적금 가입"}
            </button>
          </div>
        )}
        {fdNotice ? <p className="wallet-fd-notice" role="status">{fdNotice}</p> : null}
        {fdError && (
          <p className="wallet-fd-error" role="alert">
            {fdError}
          </p>
        )}
        {data.activeFDs.length > 0 ? (
          <>
            <h4>진행 중인 적금</h4>
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
          </>
        ) : null}
      </section>
    </div>
  );
}
