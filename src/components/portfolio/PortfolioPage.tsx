"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  PortfolioCardDTO,
  PortfolioRosterDTO,
} from "@/lib/portfolio-dto";
import { PortfolioRoster } from "./PortfolioRoster";
import { PortfolioStudentView } from "./PortfolioStudentView";
import { ShowcaseLimitModal } from "./ShowcaseLimitModal";
import { useShowcaseToggle } from "./useShowcaseToggle";

type Props = {
  initialRoster: PortfolioRosterDTO;
  /** 학생 viewer 의 자기 학생 id. 교사/학부모면 null */
  selfStudentId: string | null;
  /** 학부모가 자녀 본인 페이지 진입 시: 자녀 id를 default 선택 */
  defaultStudentId: string | null;
};

export function PortfolioPage({
  initialRoster,
  selfStudentId,
  defaultStudentId,
}: Props) {
  const [roster, setRoster] = useState(initialRoster);
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
    defaultStudentId ?? selfStudentId ?? initialRoster.students[0]?.id ?? null;
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    initialStudentId
  );

  // 자식 컴포넌트의 카드 state 패치 함수 등록 (자랑해요 토글 후 동기화)
  const cardPatcherRef = useRef<((cardId: string, on: boolean) => void) | null>(
    null
  );

  function handleAfterToggle(cardId: string, on: boolean) {
    cardPatcherRef.current?.(cardId, on);
    // 좌측 로스터 자랑해요 카운트도 업데이트
    if (selfStudentId) {
      setRoster((r) => ({
        ...r,
        students: r.students.map((s) =>
          s.id === selfStudentId
            ? {
                ...s,
                showcaseCount: Math.max(
                  0,
                  s.showcaseCount + (on ? 1 : -1)
                ),
              }
            : s
        ),
      }));
    }
  }

  const { toggle, busy, limitModal, replaceWith, dismissLimit } =
    useShowcaseToggle({
      onAfterToggle: handleAfterToggle,
    });

  function onCardToggle(card: PortfolioCardDTO) {
    void toggle(card);
  }

  // 모바일 stack 모드 — 학생 선택 시 listView 숨기고 detail 만 표시
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  // 데스크톱 드로어 토글. 기본 닫힘 — 메인 콘텐츠가 풀 폭으로 보이고 토글은
  // 좌측 여백 floating. DJ 재생완료 드로어 패턴.
  const [rosterOpen, setRosterOpen] = useState(false);
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
  const showMobileRoster = isMobile && !mobileShowDetail;

  return (
    <>
      {/* 페이지 헤더 — DJ 보드 패턴: 풀폭 행에 제목 + 우측 액션 (토글 버튼).
          floating 분리 토글 폐기, 토글이 이 헤더 안에 들어옴. */}
      <header className="portfolio-page-header">
        <div className="portfolio-page-header-left">
          <Link
            href="/student"
            className="portfolio-page-back"
            aria-label="학생 메인으로"
          >
            ←
          </Link>
          <h1 className="portfolio-page-title">포트폴리오</h1>
        </div>
        <div className="portfolio-page-header-actions">
          {!isMobile && (
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
          )}
        </div>
      </header>

      {/* 데스크톱 드로어 백드롭 — 메인 위에 어둡게 깔림. 클릭 시 닫힘. */}
      {!isMobile && (
        <div
          className={`portfolio-roster-backdrop${rosterOpen ? " is-open" : ""}`}
          onClick={() => setRosterOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 데스크톱 드로어 본체 — fixed-position, 항상 mount 되어 있음 (transform
          으로 슬라이드). 모바일은 페이지 안 인라인 렌더 분기. */}
      {!isMobile && (
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
      )}

      <div
        className={[
          "portfolio-page",
          isMobile ? "is-mobile" : "",
          isMobile && mobileShowDetail ? "is-detail" : "",
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
          {isMobile && mobileShowDetail && (
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
              busyCardId={busy}
              onToggleShowcase={onCardToggle}
              registerCardPatcher={(p) => {
                cardPatcherRef.current = p;
              }}
            />
          ) : (
            <div className="portfolio-empty">
              <p>좌측에서 학생을 선택하세요.</p>
            </div>
          )}
        </main>

        {limitModal && (
          <ShowcaseLimitModal
            showcased={limitModal.showcased}
            onCancel={dismissLimit}
            onConfirm={(removeId) => void replaceWith(removeId)}
          />
        )}
      </div>
    </>
  );
}
