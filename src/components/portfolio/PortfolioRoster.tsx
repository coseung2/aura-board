"use client";

import type { PortfolioRosterStudentDTO } from "@/lib/portfolio-dto";

type Props = {
  classroomName: string;
  students: PortfolioRosterStudentDTO[];
  selectedStudentId: string | null;
  selfStudentId: string | null;
  onSelect: (studentId: string) => void;
  /** 데스크톱 사이드바 토글 닫기 — undefined 면 닫기 버튼 미노출(모바일 등) */
  onClose?: () => void;
  /** 데스크톱 드로어 모드 — true 면 fixed-position 슬라이드 (DJ 재생완료
   *  드로어 패턴). false/undefined 면 인라인 (모바일). */
  drawerMode?: boolean;
  /** drawerMode 가 true 일 때만 의미. true → 화면에 슬라이드 인. */
  drawerOpen?: boolean;
};

export function PortfolioRoster({
  classroomName,
  students,
  selectedStudentId,
  selfStudentId,
  onSelect,
  onClose,
  drawerMode,
  drawerOpen,
}: Props) {
  const className = [
    "portfolio-roster",
    drawerMode ? "is-drawer" : "",
    drawerMode && drawerOpen ? "is-open" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <aside
      className={className}
      aria-label={`${classroomName} 학생 명단`}
      aria-hidden={drawerMode && !drawerOpen ? true : undefined}
    >
      <header className="portfolio-roster-head">
        <h2 className="portfolio-roster-title">{classroomName}</h2>
        <span className="portfolio-roster-count">{students.length}명</span>
        {onClose && (
          <button
            type="button"
            className="portfolio-roster-close"
            onClick={onClose}
            aria-label="친구 목록 접기"
            title="접기"
          >
            ×
          </button>
        )}
      </header>
      {students.length === 0 ? (
        <p className="portfolio-roster-empty">우리 반에 친구가 아직 없어요.</p>
      ) : (
        <ul className="portfolio-roster-list" role="listbox">
          {students.map((s) => {
            const isSelf = s.id === selfStudentId;
            const isSelected = s.id === selectedStudentId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={[
                    "portfolio-roster-item",
                    isSelf ? "is-self" : "",
                    isSelected ? "is-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role="option"
                  aria-selected={isSelected}
                  aria-label={`${s.name}${
                    s.number != null ? `, 출석번호 ${s.number}` : ""
                  }, 작품 ${s.cardCount}개${
                    s.showcaseCount > 0 ? `, 자랑해요 ${s.showcaseCount}개` : ""
                  }${isSelf ? ", 나" : ""}`}
                  title={s.name}
                  onClick={() => onSelect(s.id)}
                >
                  <span className="portfolio-roster-num">
                    {s.number ?? "—"}
                  </span>
                  <span className="portfolio-roster-name">
                    {isSelf && (
                      <span className="portfolio-roster-self-dot" aria-hidden>
                        🟢
                      </span>
                    )}
                    {s.name}
                  </span>
                  <span className="portfolio-roster-meta">
                    <span
                      className={
                        s.cardCount === 0 ? "portfolio-roster-meta-empty" : ""
                      }
                    >
                      작품 {s.cardCount}개
                    </span>
                    {s.showcaseCount > 0 && (
                      <span
                        className="portfolio-roster-showcase"
                        aria-label={`자랑해요 ${s.showcaseCount}개`}
                      >
                        🌟 {s.showcaseCount}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
