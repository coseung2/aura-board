"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ChildRow } from "./ParentChildSelector";
import { ParentPortfolioView } from "../portfolio/ParentPortfolioView";
import { ParentPendingLinks, type ParentPendingLink } from "./ParentPendingLinks";

type Props = {
  children: ChildRow[];
  initialSelectedId: string;
  pendingLinks?: ParentPendingLink[];
};

const LAST_CHILD_KEY = "parent-dashboard-last-child";

export function ParentDashboard({
  children: childRows,
  initialSelectedId,
  pendingLinks = [],
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const selected = childRows.find((child) => child.studentId === selectedId) ?? childRows[0];

  function selectChild(studentId: string) {
    if (studentId === selected?.studentId) return;
    setSelectedId(studentId);
    localStorage.setItem(LAST_CHILD_KEY, studentId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("child", studentId);
    router.replace(`/parent/home?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="parent-feed-page">
      <section className="parent-child-stories" aria-label="자녀 선택">
        <div className="parent-child-stories-copy">
          <p>우리 아이 기록</p>
          <h1>오늘의 성장 피드</h1>
        </div>
        <div className="parent-child-story-list">
          {childRows.map((child) => {
            const isSelected = child.studentId === selected?.studentId;
            return (
              <button
                key={child.studentId}
                type="button"
                className={`parent-child-story${isSelected ? " is-selected" : ""}`}
                onClick={() => selectChild(child.studentId)}
                aria-pressed={isSelected}
              >
                <span className="parent-child-story-ring">
                  <span className="parent-child-story-avatar" aria-hidden>
                    {child.studentName.trim().slice(0, 1) || "아"}
                  </span>
                </span>
                <span className="parent-child-story-name">{child.studentName}</span>
              </button>
            );
          })}
          <a className="parent-child-story is-add" href="/parent/onboard/match/code">
            <span className="parent-child-story-ring">
              <span className="parent-child-story-avatar" aria-hidden>+</span>
            </span>
            <span className="parent-child-story-name">자녀 추가</span>
          </a>
        </div>
      </section>

      <ParentPendingLinks links={pendingLinks} compact />

      {selected ? (
        <ParentPortfolioView
          key={selected.studentId}
          childId={selected.studentId}
          childName={selected.studentName}
          childNumber={selected.studentNumber}
          classroomName={selected.classroomName}
        />
      ) : (
        <div className="parent-feed-empty">
          <span aria-hidden>👨‍👩‍👧</span>
          <h2>연결된 자녀가 없어요</h2>
          <p>자녀를 연결하면 교실에서 만든 게시물이 이곳에 모여요.</p>
          <a href="/parent/onboard/match/code">자녀 연결하기</a>
        </div>
      )}
    </div>
  );
}
