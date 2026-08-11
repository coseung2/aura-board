"use client";

import Link from "next/link";
import { AppBackgroundButton } from "@/components/AppBackground";
import { MORNING_ROSTER_COLUMNS, useClassroomMorningDashboard, type ClassroomMorningDashboardProps as Props, type RoleTab } from "./useClassroomMorningDashboard";

type DateNavigationProps = {
  date: string;
  onPrevious: () => void;
  onNext: () => void;
};

const ROLE_TABS: readonly RoleTab[] = ["cleaning", "shoe"];

function formatDateNav(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function shiftDate(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function DateNavigation({
  date,
  onPrevious,
  onNext,
}: DateNavigationProps) {
  return (
    <div className="date-nav">
      <button
        type="button"
        className="date-nav-btn"
        aria-label="이전 날짜"
        onClick={onPrevious}
      >
        ‹
      </button>
      <span className="date-nav-label">{formatDateNav(date)}</span>
      <button
        type="button"
        className="date-nav-btn"
        aria-label="다음 날짜"
        onClick={onNext}
      >
        ›
      </button>
    </div>
  );
}

function PanelToggle({
  label,
  expanded,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="morning-panel-toggle-wrap">
      <button
        type="button"
        className="morning-panel-toggle"
        aria-label={label}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {expanded ? "▲" : "▼"}
      </button>
    </div>
  );
}

export function ClassroomMorningDashboard({
  classroomId, classroomName, sections = ["assignments", "duties"], showToolbar = true,
}: Props) {
  const {
    showAssignments,
    showDuties,
    summary,
    loaded,
    error,
    lastUpdated,
    expandedAssignments,
    setExpandedAssignments,
    selectedCleaning,
    setSelectedCleaning,
    selectedShoe,
    setSelectedShoe,
    shoeSaving,
    activeRoleTab,
    setActiveRoleTab,
    roleTabRefs,
    cleaningDuties,
    dutiesLoaded,
    dutiesError,
    inspDate,
    setInspDate,
    cleaningItems,
    shoeItems,
    inspLoaded,
    expandedPanels,
    setExpandedPanels,
    bodyRefs,
    overflowPanels,
    assignmentSections,
    cleaningRows,
    refresh,
    handleRoleTabKeyDown,
    completeShoeFinding,
  } = useClassroomMorningDashboard({ classroomId, classroomName, sections, showToolbar });
  return (
    <section
      className={`morning-dashboard${showToolbar ? "" : " is-embedded"}`}
    >
      {showToolbar ? (
      <header className="morning-dashboard-toolbar">
        <div className="morning-dashboard-context">
          <Link
            href={`/classroom/${classroomId}/dashboard`}
            className="classroom-back-link"
          >
            &larr; 학급 대시보드
          </Link>
          <span className="morning-dashboard-classroom">{classroomName}</span>
        </div>
        <div className="morning-dashboard-actions">
          <div
            className="morning-background-action"
            role="button"
            tabIndex={0}
            aria-label="배경 설정"
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.currentTarget.querySelector("input")?.click();
            }}
          >
            <AppBackgroundButton />
          </div>
        </div>
      </header>
      ) : null}

      {!loaded ? (
        <p className="morning-state check-loading" role="status">
          불러오는 중…
        </p>
      ) : error ? (
        <p className="morning-state check-error" role="alert">
          {error}
        </p>
      ) : !summary ? (
        <p className="morning-state check-empty" role="status">
          표시할 아침 정보가 없습니다.
        </p>
      ) : (
        <>
          <div className="morning-grid">
            {showAssignments ? (
            <section
              className="morning-group morning-assignment-group"
              aria-labelledby="morning-assignment-heading"
            >
              <header className="morning-group-heading">
                <h2 id="morning-assignment-heading">과제</h2>
              </header>
              <div className="morning-assignment-list">
                {assignmentSections.length === 0 ? (
                  <p className="classroom-dashboard-empty">
                    모든 과제를 제출했습니다 🎉
                  </p>
                ) : (
                  <ul>
                    {assignmentSections.map((section, index) => {
                      const rowId = `morning-assignment-panel-${index}`;
                      const buttonId = `morning-assignment-row-${index}`;
                      const isExpanded = Boolean(expandedAssignments[index]);
                      return (
                        <li key={section.id} className="morning-assignment-row">
                          <button
                            id={buttonId}
                            type="button"
                            className="morning-assignment-row-button"
                            aria-expanded={isExpanded}
                            aria-controls={rowId}
                            onClick={() =>
                              setExpandedAssignments((current) => ({
                                ...current,
                                [index]: !current[index],
                              }))
                            }
                          >
                            <span className="morning-assignment-row-title">
                              {section.title}
                            </span>
                            {section.dueDate && (
                              <span className="morning-assignment-row-due">
                                {new Date(section.dueDate).toLocaleDateString(
                                  "ko-KR",
                                )}
                              </span>
                            )}
                            <span className="morning-assignment-row-count">
                              미제출 {section.students.length}명
                            </span>
                          </button>
                          {isExpanded && (
                            <div
                              id={rowId}
                              role="region"
                              aria-labelledby={buttonId}
                              className="morning-assignment-row-panel"
                            >
                              <ul className="morning-name-list">
                                {section.students.map((student) => (
                                  <li
                                    key={student.id}
                                    className="morning-name-text"
                                  >
                                    {student.number && (
                                      <span className="morning-list-num">
                                        {student.number}
                                      </span>
                                    )}
                                    {" "}
                                    <span>{student.name}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
            ) : null}

            {showDuties ? (
            <section
              className="morning-group morning-role-group"
              aria-labelledby="morning-role-heading"
            >
              <header className="classroom-strong-section-header morning-role-heading">
                <h2
                  id="morning-role-heading"
                  className="classroom-strong-section-title"
                >
                  1인1역할
                </h2>
                <div
                  className="classroom-strong-section-navigation morning-role-tabs"
                  role="tablist"
                  aria-label="1인1역할"
                >
                <button
                  ref={(element) => {
                    roleTabRefs.current.cleaning = element;
                  }}
                  id="morning-role-tab-cleaning"
                  type="button"
                  role="tab"
                  aria-selected={activeRoleTab === "cleaning"}
                  aria-controls="morning-role-panel-cleaning"
                  tabIndex={activeRoleTab === "cleaning" ? 0 : -1}
                  className={`classroom-strong-section-tab morning-role-tab ${
                    activeRoleTab === "cleaning" ? "is-active" : ""
                  }`}
                  onClick={() => setActiveRoleTab("cleaning")}
                  onKeyDown={handleRoleTabKeyDown}
                >
                  교실 청소
                </button>
                <button
                  ref={(element) => {
                    roleTabRefs.current.shoe = element;
                  }}
                  id="morning-role-tab-shoe"
                  type="button"
                  role="tab"
                  aria-selected={activeRoleTab === "shoe"}
                  aria-controls="morning-role-panel-shoe"
                  tabIndex={activeRoleTab === "shoe" ? 0 : -1}
                  className={`classroom-strong-section-tab morning-role-tab ${
                    activeRoleTab === "shoe" ? "is-active" : ""
                  }`}
                  onClick={() => setActiveRoleTab("shoe")}
                  onKeyDown={handleRoleTabKeyDown}
                >
                  실내화 정리
                </button>
                </div>
              </header>

              {activeRoleTab === "cleaning" || !showToolbar ? (
                <div
                  id="morning-role-panel-cleaning"
                  role="tabpanel"
                  aria-labelledby="morning-role-tab-cleaning"
                  tabIndex={0}
                  className="morning-role-panel-stack"
                >
                  <section
                    className="classroom-dashboard-panel morning-panel morning-subsection"
                    aria-labelledby="morning-cleaning-heading"
                  >
                    <div className="classroom-dashboard-panel-head">
                      <div>
                        <h3 id="morning-cleaning-heading">
                          청소 검사 결과
                          <span className="morning-title-count">
                            {cleaningItems.length}명
                          </span>
                        </h3>
                      </div>
                      <DateNavigation
                        date={inspDate}
                        onPrevious={() => setInspDate(shiftDate(inspDate, -1))}
                        onNext={() => setInspDate(shiftDate(inspDate, 1))}
                      />
                    </div>
                    <div
                      className={
                        expandedPanels.cleaning
                          ? "morning-panel-body is-expanded"
                          : "morning-panel-body"
                      }
                      ref={(element) => {
                        bodyRefs.current.cleaning = element;
                      }}
                    >
                      {!inspLoaded ? (
                        <p className="classroom-dashboard-empty">불러오는 중...</p>
                      ) : cleaningItems.length === 0 ? (
                        <p className="classroom-dashboard-empty">
                          청소 지적이 없습니다 🎉
                        </p>
                      ) : (
                        <div className="morning-cleaning-table">
                          {cleaningRows.map((row, rowIndex) => (
                            <div
                              key={rowIndex}
                              className="morning-cleaning-table-row"
                            >
                              {Array.from(
                                { length: MORNING_ROSTER_COLUMNS },
                                (_, cellIndex) => cellIndex,
                              ).map((cellIndex) => {
                                const item = row[cellIndex];
                                if (!item) {
                                  return (
                                    <span
                                      key={`empty-${cellIndex}`}
                                      className="morning-cleaning-cell is-empty"
                                    />
                                  );
                                }
                                const content = (
                                  <>
                                    {item.student.number && (
                                      <span className="morning-list-num">
                                        {item.student.number}
                                      </span>
                                    )}
                                    {" "}
                                    <span>{item.student.name}</span>
                                    {item.photoUrl ? (
                                      <svg
                                        className="morning-photo-icon"
                                        viewBox="0 0 24 24"
                                        aria-label="사진 있음"
                                        role="img"
                                      >
                                        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11Z" />
                                        <path d="M7 16.5 10.2 13l2.2 2.4 1.7-1.8 3 2.9" />
                                        <circle cx="16" cy="8.5" r="1.4" />
                                      </svg>
                                    ) : (
                                      <span
                                        className="morning-photo-spacer"
                                        aria-hidden="true"
                                      />
                                    )}
                                  </>
                                );
                                return item.photoUrl ? (
                                  <button
                                    key={item.student.id}
                                    type="button"
                                    className="morning-cleaning-cell morning-name-clickable"
                                    onClick={() => setSelectedCleaning(item)}
                                  >
                                    {content}
                                  </button>
                                ) : (
                                  <span
                                    key={item.student.id}
                                    className="morning-cleaning-cell"
                                  >
                                    {content}
                                  </span>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {overflowPanels.cleaning && (
                      <PanelToggle
                        label="청소 검사 결과 전체 보기"
                        expanded={Boolean(expandedPanels.cleaning)}
                        onToggle={() =>
                          setExpandedPanels((previous) => ({
                            ...previous,
                            cleaning: !previous.cleaning,
                          }))
                        }
                      />
                    )}
                  </section>

                  <section
                    className="classroom-dashboard-panel morning-panel morning-subsection"
                    aria-labelledby="morning-duties-heading"
                  >
                    <div className="classroom-dashboard-panel-head">
                      <div>
                        <h3 id="morning-duties-heading">
                          오늘의 청소당번
                          <span className="morning-title-count">
                            {cleaningDuties.length}명
                          </span>
                        </h3>
                      </div>
                    </div>
                    <div
                      className={
                        expandedPanels.duties
                          ? "morning-panel-body is-expanded"
                          : "morning-panel-body"
                      }
                      ref={(element) => {
                        bodyRefs.current.duties = element;
                      }}
                    >
                      {!dutiesLoaded ? (
                        <p className="classroom-dashboard-empty">불러오는 중...</p>
                      ) : dutiesError ? (
                        <p className="check-error" role="alert">
                          {dutiesError}
                        </p>
                      ) : cleaningDuties.length === 0 ? (
                        <p className="classroom-dashboard-empty">
                          오늘 청소 당번이 없습니다 🎉
                        </p>
                      ) : (
                        <ul className="morning-name-list">
                          {cleaningDuties.map((duty) => (
                            <li
                              key={duty.studentId}
                              className="morning-name-text"
                            >
                              <span className="morning-list-num">
                                {duty.studentNumber}
                              </span>
                              {" "}
                              <span>{duty.studentName}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {overflowPanels.duties && (
                      <PanelToggle
                        label="오늘의 청소당번 전체 보기"
                        expanded={Boolean(expandedPanels.duties)}
                        onToggle={() =>
                          setExpandedPanels((previous) => ({
                            ...previous,
                            duties: !previous.duties,
                          }))
                        }
                      />
                    )}
                  </section>
                </div>
              ) : null}
              {activeRoleTab === "shoe" || !showToolbar ? (
                <div
                  id="morning-role-panel-shoe"
                  role="tabpanel"
                  aria-labelledby="morning-role-tab-shoe"
                  tabIndex={0}
                  className="morning-role-panel-stack"
                >
                  <section
                    className="classroom-dashboard-panel morning-panel morning-subsection"
                    aria-labelledby="morning-shoe-heading"
                  >
                    <div className="classroom-dashboard-panel-head">
                      <div>
                        <h3 id="morning-shoe-heading">
                          실내화 정리 결과
                          <span className="morning-title-count">
                            {shoeItems.length}명
                          </span>
                        </h3>
                      </div>
                      <DateNavigation
                        date={inspDate}
                        onPrevious={() => setInspDate(shiftDate(inspDate, -1))}
                        onNext={() => setInspDate(shiftDate(inspDate, 1))}
                      />
                    </div>
                    <div
                      className={
                        expandedPanels.shoe
                          ? "morning-panel-body is-expanded"
                          : "morning-panel-body"
                      }
                      ref={(element) => {
                        bodyRefs.current.shoe = element;
                      }}
                    >
                      {!inspLoaded ? (
                        <p className="classroom-dashboard-empty">불러오는 중...</p>
                      ) : shoeItems.length === 0 ? (
                        <p className="classroom-dashboard-empty">
                          실내화 미정리 학생이 없습니다 🎉
                        </p>
                      ) : (
                        <ul className="morning-name-list">
                          {shoeItems.map((item) => (
                            <li key={item.student.id}>
                              <button
                                type="button"
                                className="morning-name-button morning-name-clickable"
                                onClick={() => setSelectedShoe(item)}
                              >
                                {item.student.number && (
                                  <span className="morning-list-num">
                                    {item.student.number}
                                  </span>
                                )}
                                {" "}
                                <span>{item.student.name}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {overflowPanels.shoe && (
                      <PanelToggle
                        label="실내화 정리 결과 전체 보기"
                        expanded={Boolean(expandedPanels.shoe)}
                        onToggle={() =>
                          setExpandedPanels((previous) => ({
                            ...previous,
                            shoe: !previous.shoe,
                          }))
                        }
                      />
                    )}
                  </section>
                </div>
              ) : null}
            </section>
            ) : null}
          </div>

          {lastUpdated && (
            <p className="morning-updated">
              마지막 업데이트 {lastUpdated.toLocaleTimeString("ko-KR")}
            </p>
          )}
        </>
      )}

      {selectedCleaning && (
        <div
          className="morning-modal-layer morning-photo-modal-layer"
          role="presentation"
        >
          <button
            type="button"
            className="morning-modal-backdrop"
            aria-label="청소 사진 닫기"
            onClick={() => setSelectedCleaning(null)}
          />
          <section
            className="morning-cleaning-modal morning-cleaning-photo-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedCleaning.student.name} 청소 검사 사진`}
          >
            <header>
              <div>
                <h3>{selectedCleaning.student.name}</h3>
                {selectedCleaning.seatLabel && (
                  <p>자리 {selectedCleaning.seatLabel}</p>
                )}
              </div>
              <button
                type="button"
                className="modal-close morning-modal-close morning-photo-modal-close"
                onClick={() => setSelectedCleaning(null)}
                aria-label="닫기"
              >
                ×
              </button>
            </header>
            {selectedCleaning.photoUrl ? (
              <img
                src={selectedCleaning.photoUrl}
                alt={`${selectedCleaning.student.name} 자리 사진`}
              />
            ) : (
              <p className="morning-modal-empty">등록된 사진이 없습니다.</p>
            )}
            {selectedCleaning.note && (
              <p className="morning-cleaning-note">{selectedCleaning.note}</p>
            )}
          </section>
        </div>
      )}

      {selectedShoe && (
        <div className="morning-modal-layer" role="presentation">
          <button
            type="button"
            className="morning-modal-backdrop"
            aria-label="실내화 정리 완료 창 닫기"
            onClick={() => {
              if (!shoeSaving) setSelectedShoe(null);
            }}
          />
          <section
            className="morning-cleaning-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedShoe.student.name} 실내화 정리 완료`}
          >
            <header>
              <div>
                <h3>{selectedShoe.student.name}</h3>
                {selectedShoe.student.number && (
                  <p>{selectedShoe.student.number}번</p>
                )}
              </div>
              <button
                type="button"
                className="modal-close morning-modal-close"
                onClick={() => setSelectedShoe(null)}
                disabled={shoeSaving}
                aria-label="닫기"
              >
                ×
              </button>
            </header>
            <p className="morning-modal-empty">
              실내화 정리를 완료 처리할까요?
            </p>
            <div className="morning-modal-actions">
              <button
                type="button"
                className="morning-modal-secondary"
                onClick={() => setSelectedShoe(null)}
                disabled={shoeSaving}
              >
                취소
              </button>
              <button
                type="button"
                className="morning-modal-primary"
                onClick={() => void completeShoeFinding()}
                disabled={shoeSaving}
              >
                {shoeSaving ? "처리 중..." : "완료"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
