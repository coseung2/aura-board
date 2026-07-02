"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMorningSummary, type MorningSummary } from "@/lib/inspections-client";

type Props = { classroomId: string };

const REFRESH_MS = 60_000;

export function ClassroomMorningDashboard({ classroomId }: Props) {
  const [summary, setSummary] = useState<MorningSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedCleaning, setSelectedCleaning] = useState<
    MorningSummary["cleaningFindings"][number] | null
  >(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchMorningSummary(classroomId);
      setSummary(data);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "아침 정보를 불러오지 못했습니다.");
    } finally {
      setLoaded(true);
    }
  }, [classroomId]);

  useEffect(() => {
    setLoaded(false);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!autoRefresh) return;
    timerRef.current = setInterval(refresh, REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [autoRefresh, refresh]);

  const kpis = summary?.kpis;
  const assignmentSections = summary
    ? summary.missingAssignments.reduce<
        Array<{
          id: string;
          title: string;
          dueDate: string | null;
          students: MorningSummary["missingAssignments"][number]["student"][];
        }>
      >((sections, item) => {
        for (const task of item.tasks) {
          let section = sections.find((s) => s.id === task.id);
          if (!section) {
            section = {
              id: task.id,
              title: task.title,
              dueDate: task.dueDate,
              students: [],
            };
            sections.push(section);
          }
          section.students.push(item.student);
        }
        return sections;
      }, [])
    : [];

  return (
    <section className="morning-dashboard">
      <header className="morning-dashboard-header">
        <div>
          <span className="classroom-dashboard-eyebrow">아침 조회</span>
          <h2 className="morning-dashboard-title">
            {summary?.classroomName ?? "학급"} · 좋은 아침입니다
          </h2>
          {summary && (
            <p className="morning-dashboard-date">
              {new Date(summary.date).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </p>
          )}
        </div>
        <div className="morning-dashboard-controls">
          <label className="morning-autorefresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>자동 새로고침</span>
          </label>
          <button
            type="button"
            className="morning-refresh-btn"
            onClick={refresh}
          >
            새로고침
          </button>
        </div>
      </header>

      {!loaded ? (
        <p className="check-loading">불러오는 중…</p>
      ) : error ? (
        <p className="check-error">{error}</p>
      ) : !summary ? (
        <p className="check-empty">표시할 아침 정보가 없습니다.</p>
      ) : (
        <>
          <section className="morning-kpis" aria-label="아침 요약">
            <article className="morning-kpi">
              <span>미제출 과제 학생</span>
              <strong>
                {kpis?.missingAssignmentCount ?? 0}
                <small> / {kpis?.totalStudents ?? 0}명</small>
              </strong>
            </article>
            <article className="morning-kpi morning-kpi-clean">
              <span>청소 지적</span>
              <strong>{kpis?.cleaningDirtyCount ?? 0}</strong>
            </article>
            <article className="morning-kpi morning-kpi-shoe">
              <span>실내화 미정리</span>
              <strong>{kpis?.shoeNotArrangedCount ?? 0}</strong>
            </article>
          </section>

          <div className="morning-grid">
            <section className="classroom-dashboard-panel morning-panel">
              <div className="classroom-dashboard-panel-head">
                <div>
                  <h3>미제출 과제</h3>
                </div>
              </div>
              {assignmentSections.length === 0 ? (
                <p className="classroom-dashboard-empty">
                  모두 제출했습니다 🎉
                </p>
              ) : (
                <div className="morning-section-list">
                  {assignmentSections.map((section) => (
                    <section key={section.id} className="morning-name-section">
                      <h4>
                        {section.title}
                        {section.dueDate && (
                          <span>
                            {new Date(section.dueDate).toLocaleDateString("ko-KR")}
                          </span>
                        )}
                      </h4>
                      <ul className="morning-name-list">
                        {section.students.map((student) => (
                          <li key={student.id} className="morning-name-item">
                            {student.number && (
                              <span className="morning-list-num">{student.number}</span>
                            )}
                            <span>{student.name}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </section>

            <section className="classroom-dashboard-panel morning-panel">
              <div className="classroom-dashboard-panel-head">
                <div>
                  <h3>청소 검사 결과</h3>
                </div>
              </div>
              {summary.cleaningFindings.length === 0 ? (
                <p className="classroom-dashboard-empty">
                  청소 지적이 없습니다 🎉
                </p>
              ) : (
                <ul className="morning-name-list morning-cleaning-name-list">
                  {summary.cleaningFindings.map((item) => (
                    <li key={item.student.id}>
                      <button
                        type="button"
                        className="morning-name-item morning-name-button"
                        onClick={() => setSelectedCleaning(item)}
                      >
                        {item.student.number && (
                          <span className="morning-list-num">
                            {item.student.number}
                          </span>
                        )}
                        <span>{item.student.name}</span>
                        {item.seatLabel && (
                          <span className="morning-name-meta">{item.seatLabel}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="classroom-dashboard-panel morning-panel">
              <div className="classroom-dashboard-panel-head">
                <div>
                  <h3>실내화 정리 결과</h3>
                </div>
              </div>
              {summary.shoeFindings.length === 0 ? (
                <p className="classroom-dashboard-empty">
                  실내화 미정리 학생이 없습니다 🎉
                </p>
              ) : (
                <ul className="morning-name-list">
                  {summary.shoeFindings.map((item) => (
                    <li key={item.student.id} className="morning-name-item">
                      {item.student.number && (
                        <span className="morning-list-num">
                          {item.student.number}
                        </span>
                      )}
                      <span>{item.student.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {lastUpdated && (
            <p className="morning-updated">
              마지막 업데이트 {lastUpdated.toLocaleTimeString("ko-KR")}
            </p>
          )}
        </>
      )}

      {selectedCleaning && (
        <div className="morning-modal-layer" role="presentation">
          <button
            type="button"
            className="morning-modal-backdrop"
            aria-label="청소 사진 닫기"
            onClick={() => setSelectedCleaning(null)}
          />
          <section
            className="morning-cleaning-modal"
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
                className="morning-modal-close"
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
    </section>
  );
}
