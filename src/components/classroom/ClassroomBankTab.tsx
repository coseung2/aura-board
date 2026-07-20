"use client";

import { useCallback, useEffect, useState } from "react";
import { isCreditTransactionType, isCorrectionTransaction } from "@/lib/bank-transactions";

type Student = {
  id: string;
  number: number | null;
  name: string;
  balance: number;
  accountId: string | null;
};
type FixedDeposit = {
  id: string;
  accountId: string;
  principal: number;
  monthlyRate: number;
  startDate: string;
  maturityDate: string;
};
type Transaction = {
  id: string;
  accountId: string;
  student: { id: string; name: string; number: number | null };
  type: string;
  amount: number;
  balanceAfter: number;
  note: string | null;
  performedByKind: string;
  createdAt: string;
  corrected: boolean;
  correctable: boolean;
};

type Overview = {
  currency: { unitLabel: string; monthlyInterestRate: number | null };
  students: Student[];
  activeFDs: FixedDeposit[];
  totals: { totalBalance: number; activeFDTotal: number };
  recentTransactions: Transaction[];
  transactionPagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  viewerKind: "teacher" | "banker";
  canCancelFD: boolean;
};

const TYPE_LABEL: Record<string, string> = {
  deposit: "입금",
  withdraw: "출금",
  purchase: "결제",
  refund: "환불",
  fd_open: "적금 가입",
  fd_matured: "적금 만기",
  fd_cancelled: "적금 해지",
  creature_egg_purchase: "펫 알 구매",
  creature_item_purchase: "펫 아이템 구매",
  slime_purchase: "펫 구매",
  slime_item_purchase: "펫 꾸미기 구매",
  avatar_purchase: "아바타 구매",
  correction_credit: "정정 입금",
  correction_debit: "정정 출금",
};

type Props = {
  classroomId: string;
  view?: "actions" | "history";
};

export function ClassroomBankTab({ classroomId, view = "actions" }: Props) {
  const [data, setData] = useState<Overview | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [rateInput, setRateInput] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [transactionPage, setTransactionPage] = useState(1);

  const refresh = useCallback(async () => {
    const query = view === "history" ? `?page=${transactionPage}` : "";
    const res = await fetch(`/api/classrooms/${classroomId}/bank/overview${query}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const payload = (await res.json()) as Overview;
    setData(payload);
    if (payload.currency.monthlyInterestRate !== null && rateInput === "") {
      setRateInput(String(payload.currency.monthlyInterestRate));
    }
  }, [classroomId, rateInput, transactionPage, view]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAction(action: "deposit" | "withdraw") {
    if (!selectedStudent) {
      setError("학생을 먼저 선택하세요");
      return;
    }
    const n = Number(amount.replace(/,/g, ""));
    if (!Number.isInteger(n) || n <= 0) {
      setError("금액은 1 이상 정수");
      return;
    }
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const path =
        action === "deposit"
          ? `/api/classrooms/${classroomId}/bank/deposit`
          : `/api/classrooms/${classroomId}/bank/withdraw`;
      const body = { studentId: selectedStudent, amount: n, note: note || undefined };
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error;
        setError(typeof msg === "string" ? msg : "처리 실패");
        return;
      }
      setAmount("");
      setNote("");
      setToast(
        action === "deposit"
          ? "입금 완료"
          : "출금 완료"
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelFD(fdId: string) {
    if (!window.confirm("이 적금을 중도해지할까요? (이자 없이 원금만 반환)")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/classrooms/${classroomId}/bank/fixed-deposits/${fdId}/cancel`,
        { method: "POST" }
      );
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error;
        setError(typeof msg === "string" ? msg : "해지 실패");
        return;
      }
      setToast("적금 해지 완료");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleCorrect(transaction: Transaction) {
    const reason = window.prompt(
      `${transaction.student.name} 학생의 ${TYPE_LABEL[transaction.type] ?? transaction.type} ${transaction.amount.toLocaleString()} ${data?.currency.unitLabel ?? "원"} 거래를 정정합니다.\n정정 사유를 입력하세요.`,
    )?.trim();
    if (!reason) return;
    if (!window.confirm("원 거래의 반대 금액을 반영하고 정정 기록을 남길까요?")) return;

    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const res = await fetch(
        `/api/classrooms/${classroomId}/bank/transactions/${transaction.id}/correct`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      if (!res.ok) {
        const message = (await res.json().catch(() => ({}))).error;
        setError(typeof message === "string" ? message : "거래 정정 실패");
        return;
      }
      setToast("거래를 정정하고 감사 기록을 남겼습니다");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleRateSave() {
    const n = Number(rateInput);
    if (!Number.isFinite(n) || n < 0 || n > 50) {
      setError("이자율 0~50 사이");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/currency`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ monthlyInterestRate: n }),
      });
      if (!res.ok) {
        setError("이자율 저장 실패");
        return;
      }
      setToast("이자율 저장됨");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="bank-loading">은행 정보 불러오는 중…</p>;
  const unit = data.currency.unitLabel;
  const isTeacher = data.viewerKind === "teacher";

  return (
    <section className="classroom-bank">
      {isTeacher && (
        <div className="bank-summary-grid">
          <div className="bank-summary-card">
            <div className="bank-summary-label">총 예치금</div>
            <div className="bank-summary-value">
              {data.totals.totalBalance.toLocaleString()} {unit}
            </div>
          </div>
          <div className="bank-summary-card">
            <div className="bank-summary-label">활성 적금 ({data.activeFDs.length}건)</div>
            <div className="bank-summary-value">
              {data.totals.activeFDTotal.toLocaleString()} {unit}
            </div>
          </div>
          <div className="bank-summary-card">
            <div className="bank-summary-label">월 이자율</div>
            <div className="bank-summary-value">
              {data.currency.monthlyInterestRate === null
                ? "미설정"
                : `${data.currency.monthlyInterestRate}%`}
            </div>
            <div className="bank-summary-rate">
              <input
                className="bank-rate-input"
                type="number"
                step="0.1"
                min="0"
                max="50"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                placeholder="0.0"
              />
              <button
                type="button"
                className="bank-rate-save"
                onClick={handleRateSave}
                disabled={busy}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {view === "actions" ? <div className="bank-action-grid">
        <div className="bank-student-panel">
          <h3>학생 선택</h3>
          <ul className="bank-student-list">
            {data.students.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`bank-student-row ${
                    selectedStudent === s.id ? "is-selected" : ""
                  }`}
                  onClick={() => setSelectedStudent(s.id)}
                >
                  <span className="bank-student-num">{s.number ?? "-"}</span>
                  <span className="bank-student-name">{s.name}</span>
                  <span className="bank-student-balance">
                    {s.balance.toLocaleString()} {unit}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="bank-action-panel">
          <h3>처리</h3>
          <label className="bank-field">
            <span>금액</span>
            <input
              type="text"
              inputMode="numeric"
              className="bank-amount-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ""))}
              placeholder="0"
              disabled={busy}
            />
          </label>
          <label className="bank-field">
            <span>사유 (선택)</span>
            <input
              type="text"
              className="bank-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={100}
              disabled={busy}
            />
          </label>
          <div className="bank-btn-row">
            <button
              type="button"
              className="bank-btn bank-btn-deposit"
              onClick={() => handleAction("deposit")}
              disabled={busy || !selectedStudent}
            >
              ⬆ 입금
            </button>
            <button
              type="button"
              className="bank-btn bank-btn-withdraw"
              onClick={() => handleAction("withdraw")}
              disabled={busy || !selectedStudent}
            >
              ⬇ 출금
            </button>
          </div>
          {error && <p className="bank-error">{error}</p>}
          {toast && <p className="bank-toast">{toast}</p>}
        </div>
      </div> : null}

      {view === "actions" && data.activeFDs.length > 0 && (
        <section className="bank-fd-section">
          <h3>활성 적금</h3>
          <ul className="bank-fd-list">
            {data.activeFDs.map((fd) => {
              const student = data.students.find(
                (s) => s.accountId === fd.accountId
              );
              const studentName = student?.name ?? "";
              const maturity = new Date(fd.maturityDate);
              const daysLeft = Math.max(
                0,
                Math.ceil((maturity.getTime() - Date.now()) / 86400000)
              );
              return (
                <li key={fd.id} className="bank-fd-row">
                  <span className="bank-fd-principal">
                    {fd.principal.toLocaleString()} {unit}
                  </span>
                  <span className="bank-fd-rate">@ {fd.monthlyRate}%</span>
                  <span className="bank-fd-due">D-{daysLeft}</span>
                  <span className="bank-fd-student">{studentName}</span>
                  {data.canCancelFD && (
                    <button
                      type="button"
                      className="bank-fd-cancel"
                      onClick={() => handleCancelFD(fd.id)}
                      disabled={busy}
                    >
                      중도해지
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {view === "history" ? <section className="bank-txn-section">
        <h3>
          {isTeacher
            ? `전체 금전 활동 (${data.transactionPagination.total}건)`
            : "내가 처리한 거래 (최근 30건)"}
        </h3>
        {data.recentTransactions.length === 0 ? (
          <p className="bank-empty">거래 내역이 없어요.</p>
        ) : (
          <>
            <ul className="bank-txn-list">
              {data.recentTransactions.map((t) => (
              <li key={t.id} className={`bank-txn-row bank-txn-${t.type}`}>
                <span className="bank-txn-time">
                  {new Date(t.createdAt).toLocaleString("ko-KR")}
                </span>
                <span className="bank-txn-student">
                  {t.student.number === null ? "" : `${t.student.number}번 `}
                  {t.student.name}
                </span>
                <span className="bank-txn-type">
                  {TYPE_LABEL[t.type] ?? t.type}
                </span>
                <span className="bank-txn-amount">
                  {isCreditTransactionType(t.type) ? "+" : "-"}
                  {t.amount.toLocaleString()} {unit}
                </span>
                <span className="bank-txn-note">{t.note ?? ""}</span>
                <span className="bank-txn-balance">잔액 {t.balanceAfter.toLocaleString()} {unit}</span>
                <span className="bank-txn-by">by {t.performedByKind}</span>
                {isTeacher ? (
                  t.corrected ? (
                    <span className="bank-txn-corrected">정정됨</span>
                  ) : isCorrectionTransaction(t.type) ? (
                    <span className="bank-txn-corrected">정정 기록</span>
                  ) : t.correctable ? (
                    <button
                      type="button"
                      className="bank-txn-correct"
                      onClick={() => void handleCorrect(t)}
                      disabled={busy}
                    >
                      {t.type === "deposit" ? "오입금 정정" : "오출금 정정"}
                    </button>
                  ) : (
                    <span className="bank-txn-corrected">-</span>
                  )
                ) : null}
              </li>
              ))}
            </ul>
            {data.transactionPagination.totalPages > 1 ? (
              <nav className="bank-pagination" aria-label="거래 기록 페이지">
                {Array.from(
                  { length: data.transactionPagination.totalPages },
                  (_, index) => index + 1,
                ).map((page) => (
                  <button
                    key={page}
                    type="button"
                    aria-current={page === data.transactionPagination.page ? "page" : undefined}
                    onClick={() => setTransactionPage(page)}
                    disabled={page === data.transactionPagination.page}
                  >
                    {page}
                  </button>
                ))}
              </nav>
            ) : null}
          </>
        )}
      </section> : null}
    </section>
  );
}
