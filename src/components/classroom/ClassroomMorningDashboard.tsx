"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchMorningSummary,
  saveShoeFindings,
  type MorningSummary,
} from "@/lib/inspections-client";
import { uploadFile } from "@/lib/upload-client";

type Props = { classroomId: string };

const REFRESH_MS = 60_000;

export function ClassroomMorningDashboard({ classroomId }: Props) {
  const [summary, setSummary] = useState<MorningSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeAssignmentIndex, setActiveAssignmentIndex] = useState(0);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [selectedCleaning, setSelectedCleaning] = useState<
    MorningSummary["cleaningFindings"][number] | null
  >(null);
  const [selectedShoe, setSelectedShoe] = useState<
    MorningSummary["shoeFindings"][number] | null
  >(null);
  const [shoeSaving, setShoeSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backgroundStorageKey = `aura:classroom:${classroomId}:morning-background`;

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
    try {
      setBackgroundUrl(localStorage.getItem(backgroundStorageKey));
    } catch {
      setBackgroundUrl(null);
    }
  }, [backgroundStorageKey]);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    timerRef.current = setInterval(refresh, REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [refresh]);

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
  const safeAssignmentIndex = assignmentSections[activeAssignmentIndex]
    ? activeAssignmentIndex
    : 0;
  const activeAssignment = assignmentSections[safeAssignmentIndex] ?? null;
  const cleaningRows = summary
    ? Array.from(
        { length: Math.ceil(summary.cleaningFindings.length / 3) },
        (_, rowIndex) =>
          summary.cleaningFindings.slice(rowIndex * 3, rowIndex * 3 + 3),
      )
    : [];

  async function handleBackgroundFile(file: File | null) {
    if (!file || backgroundBusy) return;
    setBackgroundBusy(true);
    try {
      const uploaded = await uploadFile(file);
      const nextUrl = uploaded.previewUrl ?? uploaded.url;
      setBackgroundUrl(nextUrl);
      localStorage.setItem(backgroundStorageKey, nextUrl);
    } finally {
      setBackgroundBusy(false);
    }
  }

  async function completeShoeFinding() {
    if (!selectedShoe || shoeSaving) return;
    const shoe = selectedShoe;
    setShoeSaving(true);
    setError(null);
    try {
      await saveShoeFindings(classroomId, [
        { studentId: shoe.student.id, notArranged: false },
      ]);
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              kpis: {
                ...prev.kpis,
                shoeNotArrangedCount: Math.max(
                  0,
                  prev.kpis.shoeNotArrangedCount - 1,
                ),
              },
              shoeFindings: prev.shoeFindings.filter(
                (item) => item.student.id !== shoe.student.id,
              ),
            }
          : prev,
      );
      setSelectedShoe(null);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "실내화 정리 완료 처리에 실패했습니다.",
      );
    } finally {
      setShoeSaving(false);
    }
  }

  return (
    <section className={`morning-dashboard ${backgroundUrl ? "has-background" : ""}`}>
      {backgroundUrl && (
        <div
          className="morning-background"
          style={{ backgroundImage: `url("${backgroundUrl.replace(/"/g, "%22")}")` }}
          aria-hidden="true"
        />
      )}
      <header className="morning-board-header">
        <h1>학급게시판</h1>
        <label className="morning-background-button">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              void handleBackgroundFile(e.target.files?.[0] ?? null);
              e.currentTarget.value = "";
            }}
            disabled={backgroundBusy}
          />
          <span>{backgroundBusy ? "설정 중..." : "배경 설정"}</span>
        </label>
      </header>

      {!loaded ? (
        <p className="check-loading">불러오는 중…</p>
      ) : error ? (
        <p className="check-error">{error}</p>
      ) : !summary ? (
        <p className="check-empty">표시할 아침 정보가 없습니다.</p>
      ) : (
        <>
          <div className="morning-grid">
            <section className="classroom-dashboard-panel morning-panel">
              <div className="classroom-dashboard-panel-head">
                <div>
                  <h3>
                    미제출 과제
                    <span className="morning-title-count">
                      {activeAssignment?.students.length ?? 0}명
                    </span>
                  </h3>
                </div>
              </div>
              {assignmentSections.length === 0 ? (
                <p className="classroom-dashboard-empty">
                  모두 제출했습니다 🎉
                </p>
              ) : (
                <div className="morning-assignment-box">
                  <nav className="morning-assignment-nav" aria-label="미제출 과제 선택">
                    {assignmentSections.map((section, index) => (
                      <button
                        key={section.id}
                        type="button"
                        className={`morning-assignment-tab ${
                          safeAssignmentIndex === index ? "is-active" : ""
                        }`}
                        onClick={() => setActiveAssignmentIndex(index)}
                      >
                        {section.title}
                        {section.dueDate && (
                          <span>
                            {new Date(section.dueDate).toLocaleDateString("ko-KR")}
                          </span>
                        )}
                      </button>
                    ))}
                  </nav>
                  {activeAssignment && (
                    <ul className="morning-name-list">
                      {activeAssignment.students.map((student) => (
                        <li key={student.id} className="morning-name-text">
                          {student.number && (
                            <span className="morning-list-num">{student.number}</span>
                          )}
                          {" "}
                          <span>{student.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>

            <section className="classroom-dashboard-panel morning-panel">
              <div className="classroom-dashboard-panel-head">
                <div>
                  <h3>
                    청소 검사 결과
                    <span className="morning-title-count">
                      {summary.cleaningFindings.length}명
                    </span>
                  </h3>
                </div>
              </div>
              {summary.cleaningFindings.length === 0 ? (
                <p className="classroom-dashboard-empty">
                  청소 지적이 없습니다 🎉
                </p>
              ) : (
                <div className="morning-cleaning-table">
                  {cleaningRows.map((row, rowIndex) => (
                    <div key={rowIndex} className="morning-cleaning-table-row">
                      {[0, 1, 2].map((cellIndex) => {
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
                              <span className="morning-photo-spacer" aria-hidden="true" />
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
                          <span key={item.student.id} className="morning-cleaning-cell">
                            {content}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="classroom-dashboard-panel morning-panel">
              <div className="classroom-dashboard-panel-head">
                <div>
                  <h3>
                    실내화 정리 결과
                    <span className="morning-title-count">
                      {summary.shoeFindings.length}명
                    </span>
                  </h3>
                </div>
              </div>
              {summary.shoeFindings.length === 0 ? (
                <p className="classroom-dashboard-empty">
                  실내화 미정리 학생이 없습니다 🎉
                </p>
              ) : (
                <ul className="morning-name-list">
                  {summary.shoeFindings.map((item) => (
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
            </section>
          </div>

          <ReadingChampionsSection champions={summary.readingChampions} />

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
                className="morning-modal-close"
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

type ReadingChampionsSectionProps = {
  champions?: import("@/lib/inspections-client").ReadingChampion[];
};

function ReadingChampionsSection({ champions }: ReadingChampionsSectionProps) {
  const list = champions ?? [];
  return (
    <section className="classroom-dashboard-panel morning-panel morning-reading-panel">
      <div className="classroom-dashboard-panel-head">
        <div>
          <h3>
            독서왕
            <span className="morning-title-count">{list.length}명</span>
          </h3>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="classroom-dashboard-empty">아직 독서 기록이 없어요.</p>
      ) : (
        <ol className="morning-reading-list">
          {list.map((champ, index) => (
            <li key={champ.student.id} className="morning-reading-item">
              <span className="morning-reading-rank" aria-hidden="true">
                {index + 1}
              </span>
              <div className="morning-reading-info">
                <div className="morning-reading-name-row">
                  {champ.student.number && (
                    <span className="morning-list-num">{champ.student.number}</span>
                  )}
                  <span className="morning-reading-name">{champ.student.name}</span>
                </div>
                {champ.latestTitle && (
                  <p className="morning-reading-latest">
                    {champ.latestBookType === "comic"
                      ? "만화책"
                      : champ.latestBookType === "story"
                        ? "이야기책"
                        : ""}
                    {champ.latestBookType ? " · " : ""}
                    {champ.latestTitle}
                  </p>
                )}
              </div>
              <div className="morning-reading-stats">
                <span className="morning-reading-score">
                  {champ.totalScore}점
                </span>
                <span className="morning-reading-count">
                  {champ.entryCount}회
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
