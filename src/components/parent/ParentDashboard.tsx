"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ParentChildSelector, type ChildRow } from "./ParentChildSelector";
import { ParentPortfolioView } from "../portfolio/ParentPortfolioView";

type Props = {
  children: ChildRow[];
  initialSelectedId: string;
};

// parent-redesign (2026-04-26): 풀폭 헤더 + 자녀 셀렉터 + portfolio 본문.
// DJ 보드 헤더 패턴 일관. 자녀 선택 변경 시 URL ?child=ID 로 보존.
const LS_KEY = "parent-dashboard-last-child";

export function ParentDashboard({ children: childRows, initialSelectedId }: Props) {
  const [selectedId, setSelectedId] = useState(initialSelectedId);

  // localStorage 로 마지막 선택 자녀 복원 (URL 미설정 시) — 초기값에서 한 번만.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // 초기 마운트 시 URL 우선이라 저장된 값과 다르면 URL 값 우선.
    const saved = localStorage.getItem(LS_KEY);
    if (saved && saved === initialSelectedId) return;
    localStorage.setItem(LS_KEY, initialSelectedId);
  }, [initialSelectedId]);

  function handleSelect(studentId: string) {
    setSelectedId(studentId);
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEY, studentId);
      const url = new URL(window.location.href);
      url.searchParams.set("child", studentId);
      window.history.replaceState(null, "", url.toString());
    }
  }

  const selected = childRows.find((c) => c.studentId === selectedId);

  return (
    <>
      <header className="portfolio-page-header">
        <div className="portfolio-page-header-left">
          <ParentChildSelector
            children={childRows}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </div>
        <div className="portfolio-page-header-actions">
          <Link
            href="/parent/showcase"
            className="portfolio-header-btn"
            aria-label="우리 학급 자랑해요"
          >
            <span aria-hidden>🌟</span>
            <span>자랑해요</span>
          </Link>
          <Link
            href="/parent/onboard/match/code"
            className="portfolio-header-btn"
            aria-label="자녀 추가"
          >
            <span aria-hidden>＋</span>
            <span>자녀 추가</span>
          </Link>
        </div>
      </header>

      {selected ? (
        <ParentPortfolioView
          key={selected.studentId}
          childId={selected.studentId}
          childName={selected.studentName}
        />
      ) : (
        <div className="portfolio-empty">
          <p>자녀가 선택되지 않았어요.</p>
        </div>
      )}
    </>
  );
}
