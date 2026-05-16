"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShowcaseHighlightStrip } from "@/components/portfolio/ShowcaseHighlightStrip";
import { layoutLabel } from "@/lib/layout-meta";

type BoardItem = {
  id: string;
  slug: string;
  title: string;
  layout: string;
  quizzes?: { roomCode: string; status: string }[];
};

type Duty = {
  classroomId: string;
  classroomName: string;
  roleKey: string;
  roleLabel: string;
  emoji: string | null;
  href: string;
};

type WalletSummary = {
  balance: number;
  currency: { unitLabel: string; monthlyInterestRate: number | null };
  activeFDs: Array<{
    id: string;
    principal: number;
    monthlyRate: number;
    maturityDate: string;
  }>;
};

type Props = {
  studentName: string;
  classroomName: string;
  classroomId: string;
  boards: BoardItem[];
  duties: Duty[];
};

export function StudentDashboard({
  studentName,
  classroomName,
  classroomId,
  boards,
  duties,
}: Props) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWallet() {
      try {
        const res = await fetch("/api/my/wallet", { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()) as WalletSummary;
        if (!cancelled) setWallet(payload);
      } catch {
        // Ignore wallet summary load failures on the dashboard.
      }
    }

    loadWallet();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/student/logout", { method: "POST" });
      router.push("/login");
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <>
      <div className="student-greeting-row">
        <h1 className="student-greeting">{studentName}님, 안녕하세요</h1>
        <span className="student-classroom-badge">{classroomName}</span>
        <button
          className="student-logout-btn"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? "로그아웃 중..." : "로그아웃"}
        </button>
      </div>

      <ShowcaseHighlightStrip
        classroomId={classroomId}
        hrefBase="/student/showcase"
      />

      <div className="student-portfolio-cta-row">
        <Link href="/student/portfolio" className="student-portfolio-cta">
          우리 학급 포트폴리오 보기
        </Link>
      </div>

      <section className="student-wallet-section">
        <div className="student-wallet-card">
          <div className="student-wallet-header">
            <div>
              <p className="student-wallet-eyebrow">개인 금융</p>
              <h2 className="student-wallet-title">내 통장과 적금</h2>
            </div>
            <Link href="/my/wallet" className="student-wallet-link">
              자세히 보기
            </Link>
          </div>

          {wallet ? (
            <>
              <div className="student-wallet-balance-row">
                <span className="student-wallet-balance-label">현재 잔고</span>
                <strong className="student-wallet-balance-value">
                  {wallet.balance.toLocaleString()} {wallet.currency.unitLabel}
                </strong>
              </div>

              <div className="student-wallet-fd-strip">
                {wallet.activeFDs.length > 0 ? (
                  wallet.activeFDs.slice(0, 3).map((fd) => {
                    const daysLeft = Math.max(
                      0,
                      Math.ceil(
                        (new Date(fd.maturityDate).getTime() - Date.now()) / 86400000
                      )
                    );
                    return (
                      <div key={fd.id} className="student-wallet-fd-chip">
                        <span className="student-wallet-fd-label">적금</span>
                        <strong>
                          {fd.principal.toLocaleString()} {wallet.currency.unitLabel}
                        </strong>
                        <span>
                          이자 {fd.monthlyRate}% · D-{daysLeft}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="student-wallet-empty">
                    아직 진행 중인 적금이 없어요.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="student-wallet-empty">통장 정보를 불러오는 중이에요.</div>
          )}
        </div>
      </section>

      {duties.length > 0 && (
        <section className="student-duty-section">
          <h2 className="student-duty-title">내 역할</h2>
          <div className="student-duty-grid">
            {duties.map((duty) => (
              <Link
                key={`${duty.classroomId}-${duty.roleKey}`}
                href={duty.href}
                className="student-duty-card"
              >
                <span className="student-duty-emoji" aria-hidden="true">
                  {duty.emoji ?? "•"}
                </span>
                <span className="student-duty-role">{duty.roleLabel}</span>
                <span className="student-duty-cta">역할 시작</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {boards.length === 0 ? (
        <div className="student-empty">
          <p>아직 보드가 없어요.</p>
        </div>
      ) : (
        <>
          <p className="student-sub">오늘의 보드</p>
          <div className="student-board-grid">
            {boards.map((board) => {
              const quizCode =
                board.layout === "quiz" && board.quizzes?.[0]?.roomCode;
              const href = quizCode ? `/quiz/${quizCode}` : `/board/${board.slug}`;
              return (
                <Link
                  key={board.id}
                  href={href}
                  className="student-board-card"
                >
                  <span className="student-board-card-title">{board.title}</span>
                  <span className="student-board-card-meta">
                    {layoutLabel(board.layout)}
                    {quizCode && " · 참여하기"}
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
