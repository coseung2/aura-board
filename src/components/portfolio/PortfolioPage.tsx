"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PortfolioRosterDTO } from "@/lib/portfolio-dto";
import { PortfolioRoster } from "./PortfolioRoster";
import { PortfolioStudentView } from "./PortfolioStudentView";

type Props = {
  initialRoster: PortfolioRosterDTO;
  /** 학생 viewer 의 자기 학생 id. 교사/학부모면 null */
  selfStudentId: string | null;
  /** 학부모가 자녀 본인 페이지 진입 시: 자녀 id를 default 선택 */
  defaultStudentId: string | null;
  /** 학생 포털에서 본인 포트폴리오만 노출하고 학생 선택 UI를 숨김 */
  selfOnly?: boolean;
};

export function PortfolioPage({
  initialRoster,
  selfStudentId,
  defaultStudentId,
  selfOnly = false,
}: Props) {
  const roster = initialRoster;
  // 모바일에선 좌측 학생 클릭 시 우측 stack push 패턴 — 뷰포트 폭으로 분기
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const initialStudentId =
    (selfOnly ? selfStudentId : null) ??
    defaultStudentId ??
    selfStudentId ??
    initialRoster.students[0]?.id ??
    null;
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    initialStudentId
  );

  // 모바일 stack 모드 — 학생 선택 시 listView 숨기고 detail 만 표시
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  // 데스크톱 드로어 토글. 기본 닫힘 — 메인 콘텐츠가 풀 폭으로 보이고 토글은
  // 좌측 여백 floating. DJ 재생완료 드로어 패턴.
  const [rosterOpen, setRosterOpen] = useState(false);
  // The drawer is portalled to <body> so an ancestor stacking context (for
  // example `body.app-background-active > *`) can't trap it under the top nav.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    setPortalReady(true);
  }, []);
  function selectStudent(id: string) {
    setSelectedStudentId(id);
    if (isMobile) setMobileShowDetail(true);
    // 데스크톱: 학생 선택해도 드로어 그대로 — 사용자가 명시적으로 닫게.
    // (DJ 패턴 일치 — 곡 클릭해도 드로어가 자동 안 닫힘)
  }
  function backToList() {
    setMobileShowDetail(false);
  }

  if (initialRoster.students.length === 0) {
    return (
      <div className="portfolio-page is-empty">
        <div className="portfolio-empty">
          <p>학급에 등록된 학생이 없어요.</p>
        </div>
      </div>
    );
  }

  // 데스크톱: 드로어 (fixed-position overlay). 모바일: 인라인 stack.
  const showMobileRoster = !selfOnly && isMobile && !mobileShowDetail;

  return (
    <>
      {/* The page header (back arrow + 포트폴리오 title) is gone: the student
          view's own head row carries the title and the roster toggle. */}
      {/* 데스크톱 드로어 + 백드롭 — <body> 포털로 렌더해 상단 내비 위에 뜬다.
          fixed-position, 항상 mount 되어 있음 (transform 으로 슬라이드).
          모바일은 페이지 안 인라인 렌더 분기. */}
      {portalReady && !isMobile
        ? createPortal(
            <>
              {!selfOnly && (
                <div
                  className={`portfolio-roster-backdrop${rosterOpen ? " is-open" : ""}`}
                  onClick={() => setRosterOpen(false)}
                  aria-hidden="true"
                />
              )}
              <PortfolioRoster
                classroomName={initialRoster.classroom.name}
                students={roster.students}
                selectedStudentId={selectedStudentId}
                selfStudentId={selfStudentId}
                onSelect={selectStudent}
                onClose={() => setRosterOpen(false)}
                drawerMode
                drawerOpen={rosterOpen}
              />
            </>,
            document.body,
          )
        : null}

      <div
        className={[
          "portfolio-page",
          isMobile ? "is-mobile" : "",
          isMobile && mobileShowDetail ? "is-detail" : "",
          selfOnly ? "is-self-only" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {showMobileRoster && (
          <PortfolioRoster
            classroomName={initialRoster.classroom.name}
            students={roster.students}
            selectedStudentId={selectedStudentId}
            selfStudentId={selfStudentId}
            onSelect={selectStudent}
          />
        )}
        <main className="portfolio-main">
          {!selfOnly && isMobile && mobileShowDetail && (
            <button
              type="button"
              className="portfolio-mobile-back"
              onClick={backToList}
              aria-label="친구 목록으로"
            >
              ← 친구 목록
            </button>
          )}
          {selectedStudentId ? (
            <PortfolioStudentView
              key={selectedStudentId}
              studentId={selectedStudentId}
              selfStudentId={selfStudentId}
              headActions={
                !selfOnly && !isMobile ? (
                  <button
                    type="button"
                    className="portfolio-header-btn"
                    onClick={() => setRosterOpen((v) => !v)}
                    aria-pressed={rosterOpen}
                    aria-label="우리 반 친구들"
                    title="우리 반 친구들"
                  >
                    <span aria-hidden>👥</span>
                    <span>우리 반 친구들</span>
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="portfolio-empty">
              <p>좌측에서 학생을 선택하세요.</p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
