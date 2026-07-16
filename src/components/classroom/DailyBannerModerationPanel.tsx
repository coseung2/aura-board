"use client";

import { useEffect, useMemo, useState } from "react";

type Submission = {
  id: string;
  targetDay: string;
  kind: "text" | "image";
  text: string | null;
  imageUrl: string | null;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string | null;
  createdAt?: string;
  student?: { name: string; number: number | null };
};

type ReviewFilter = "pending" | "reviewed" | "all";

type CalendarDay = {
  date: string;
  day: number;
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function todayKst() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}년 ${month}월`;
}

function shiftMonth(monthKey: string, offset: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildMonthWeeks(monthKey: string): Array<Array<CalendarDay | null>> {
  const [year, month] = monthKey.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<CalendarDay | null> = Array.from(
    { length: firstWeekday },
    () => null,
  );

  for (let day = 1; day <= dayCount; day += 1) {
    cells.push({
      day,
      date: `${monthKey}-${String(day).padStart(2, "0")}`,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<Array<CalendarDay | null>> = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

function selectedDateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function applicantLabel(names: string[]) {
  if (names.length > 1) return `${names[0]} 외 ${names.length - 1}명`;
  return names[0] ?? null;
}

function statusLabel(status: Submission["status"]) {
  if (status === "approved") return "게시 확정";
  if (status === "rejected") return "반려";
  return "심사 대기";
}

export function DailyBannerModerationPanel({
  classroomId,
}: {
  classroomId: string;
}) {
  const [day, setDay] = useState(() => todayKst());
  const [month, setMonth] = useState(() => todayKst().slice(0, 7));
  const [items, setItems] = useState<Submission[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/classrooms/${encodeURIComponent(classroomId)}/daily-banners?month=${month}&status=all`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`status ${response.status}`);
      const body = (await response.json()) as { submissions?: Submission[] };
      setItems(body.submissions ?? []);
    } catch {
      setMessageKind("error");
      setMessage("신청 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMessage(null);
    setRejectingId(null);
    void load();
  }, [classroomId, month]);

  const selectedItems = useMemo(
    () => items.filter((item) => item.targetDay === day),
    [day, items],
  );

  const counts = useMemo(
    () => ({
      pending: selectedItems.filter((item) => item.status === "pending").length,
      approved: selectedItems.filter((item) => item.status === "approved").length,
      rejected: selectedItems.filter((item) => item.status === "rejected").length,
    }),
    [selectedItems],
  );

  const submissionNamesByDay = useMemo(() => {
    const namesByDay = new Map<string, { pending: string[]; approved: string[] }>();
    for (const item of items) {
      if (item.status === "rejected") continue;
      const names = namesByDay.get(item.targetDay) ?? { pending: [], approved: [] };
      const name = item.student?.name?.trim() || "학생";
      if (!names[item.status].includes(name)) names[item.status].push(name);
      namesByDay.set(item.targetDay, names);
    }
    return namesByDay;
  }, [items]);

  const visibleItems = useMemo(() => {
    if (filter === "pending") {
      return selectedItems.filter((item) => item.status === "pending");
    }
    if (filter === "reviewed") {
      return selectedItems.filter((item) => item.status !== "pending");
    }
    return selectedItems;
  }, [filter, selectedItems]);

  const monthWeeks = useMemo(() => buildMonthWeeks(month), [month]);

  function selectDay(nextDay: string) {
    setDay(nextDay);
    setMessage(null);
    setRejectingId(null);
  }

  function navigateMonth(offset: number) {
    const nextMonth = shiftMonth(month, offset);
    setMonth(nextMonth);
    selectDay(`${nextMonth}-01`);
  }

  function selectToday() {
    const current = todayKst();
    setMonth(current.slice(0, 7));
    selectDay(current);
  }

  async function moderate(
    id: string,
    action: "approve" | "reject",
    reason?: string,
  ) {
    if (
      action === "approve" &&
      !window.confirm(
        "이 배너를 해당 날짜의 학급 배너로 확정할까요? 학급별로 같은 날짜에는 하나만 게시할 수 있습니다.",
      )
    ) {
      return;
    }

    setBusyId(id);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/classrooms/${encodeURIComponent(classroomId)}/daily-banners/${encodeURIComponent(id)}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body:
            action === "reject"
              ? JSON.stringify({ reason: reason?.trim() || null })
              : undefined,
        },
      );
      if (response.status === 409 && action === "approve") {
        setMessageKind("error");
        setMessage("해당 날짜에는 이미 확정된 배너가 있습니다.");
      } else if (!response.ok) {
        throw new Error(`status ${response.status}`);
      } else {
        setMessageKind("success");
        setMessage(
          action === "approve"
            ? "학급 배너로 확정했습니다."
            : "신청을 반려했습니다.",
        );
        setRejectingId(null);
        setRejectionReason("");
      }
      await load();
    } catch {
      setMessageKind("error");
      setMessage("처리하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="classroom-banner-workspace" aria-labelledby="banner-review-title">
      <div className="classroom-banner-toolbar">
        <div className="classroom-banner-calendar-heading">
          <p className="classroom-feature-eyebrow">게시 일정</p>
          <div className="classroom-banner-calendar-controls">
            <button type="button" onClick={() => navigateMonth(-1)} aria-label="이전 달">
              ‹
            </button>
            <strong>{monthLabel(month)}</strong>
            <button type="button" onClick={() => navigateMonth(1)} aria-label="다음 달">
              ›
            </button>
            <button type="button" className="is-today" onClick={selectToday}>
              오늘
            </button>
          </div>
        </div>
      </div>

      <div className="classroom-banner-calendar" aria-label={`${monthLabel(month)} 배너 신청 달력`}>
        <div className="classroom-banner-calendar-weekdays" aria-hidden="true">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="classroom-banner-calendar-grid" role="grid">
          {monthWeeks.flatMap((week, weekIndex) =>
            week.map((calendarDay, dayIndex) => {
              if (!calendarDay) {
                return (
                  <span
                    key={`empty-${weekIndex}-${dayIndex}`}
                    className="classroom-banner-calendar-cell is-empty"
                    aria-hidden="true"
                  />
                );
              }

              const applicantNames = submissionNamesByDay.get(calendarDay.date);
              const calendarMarkers = [
                { status: "pending" as const, label: applicantLabel(applicantNames?.pending ?? []) },
                { status: "approved" as const, label: applicantLabel(applicantNames?.approved ?? []) },
              ].filter((marker): marker is { status: "pending" | "approved"; label: string } => Boolean(marker.label));
              const calendarStatusLabel = calendarMarkers
                .map((marker) => `${statusLabel(marker.status)} ${marker.label}`)
                .join(", ");
              const isSelected = calendarDay.date === day;
              const isToday = calendarDay.date === todayKst();
              return (
                <span key={calendarDay.date} className="classroom-banner-calendar-cell" role="gridcell">
                  <button
                    type="button"
                    className={`classroom-banner-calendar-day${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                    aria-label={`${selectedDateLabel(calendarDay.date)}${calendarStatusLabel ? `, ${calendarStatusLabel}` : ", 신청 없음"}`}
                    aria-pressed={isSelected}
                    onClick={() => selectDay(calendarDay.date)}
                  >
                    <span className="classroom-banner-calendar-day-number">{calendarDay.day}</span>
                    {calendarMarkers.length > 0 ? (
                      <span className="classroom-banner-calendar-day-markers">
                        {calendarMarkers.map((marker) => (
                          <span
                            key={marker.status}
                            className={`classroom-banner-calendar-day-count is-${marker.status}`}
                          >
                            <i aria-hidden="true" /> {marker.status === "approved" ? `[확정] ${marker.label}` : marker.label}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="classroom-banner-calendar-day-placeholder" aria-hidden="true" />
                    )}
                  </button>
                </span>
              );
            }),
          )}
        </div>
      </div>

      <div className="classroom-banner-summary" aria-label="배너 검토 요약">
        <span><strong>{counts.pending}</strong> 심사 대기</span>
        <span><strong>{counts.approved}</strong> 게시 확정</span>
        <span><strong>{counts.rejected}</strong> 반려</span>
      </div>

      <div className="classroom-banner-list-head">
        <div>
          <h2 id="banner-review-title">{selectedDateLabel(day)} 신청</h2>
        </div>
        <div className="classroom-banner-filters" role="group" aria-label="검토 상태 필터">
          {([
            ["pending", `대기 ${counts.pending}`],
            ["reviewed", `처리 ${counts.approved + counts.rejected}`],
            ["all", `전체 ${selectedItems.length}`],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "is-active" : undefined}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {message ? (
        <p
          className={`classroom-banner-notice is-${messageKind}`}
          role={messageKind === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}

      {loading ? (
        <p className="classroom-feature-empty" aria-live="polite">불러오는 중…</p>
      ) : visibleItems.length === 0 ? (
        <p className="classroom-feature-empty">
          {filter === "pending"
            ? "이 날짜에 심사 대기 중인 신청이 없습니다."
            : "현재 조건에 맞는 신청이 없습니다."}
        </p>
      ) : (
        <div className="classroom-banner-list">
          {visibleItems.map((item) => {
            const isBusy = busyId === item.id;
            const isRejecting = rejectingId === item.id;
            return (
              <article key={item.id} className="classroom-banner-item">
                <div className="classroom-banner-item-meta">
                  <strong>
                    {item.student?.number ? `${item.student.number}번 ` : ""}
                    {item.student?.name ?? "학생"}
                  </strong>
                  <span className={`classroom-banner-status is-${item.status}`}>
                    {statusLabel(item.status)}
                  </span>
                </div>

                <div className="classroom-banner-preview">
                  {item.kind === "image" && item.imageUrl ? (
                    <img src={item.imageUrl} alt="학생이 제안한 배너" />
                  ) : (
                    <p className="classroom-banner-marquee-preview">
                      {item.text || "문구 없음"}
                    </p>
                  )}
                  {item.kind === "image" && item.text ? (
                    <p className="classroom-banner-caption">{item.text}</p>
                  ) : null}
                </div>

                {item.status === "pending" ? (
                  <div className="classroom-banner-review">
                    {isRejecting ? (
                      <div className="classroom-banner-reject-form">
                        <label htmlFor={`reject-${item.id}`}>반려 사유</label>
                        <input
                          id={`reject-${item.id}`}
                          value={rejectionReason}
                          onChange={(event) => setRejectionReason(event.target.value)}
                          placeholder="학생에게 전달할 이유 (선택)"
                          maxLength={300}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="is-danger"
                          disabled={isBusy}
                          onClick={() => void moderate(item.id, "reject", rejectionReason)}
                        >
                          {isBusy ? "처리 중…" : "반려 확정"}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setRejectingId(null);
                            setRejectionReason("");
                          }}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <div className="classroom-banner-actions">
                        <button
                          type="button"
                          className="is-primary"
                          disabled={isBusy || busyId !== null}
                          onClick={() => void moderate(item.id, "approve")}
                        >
                          {isBusy ? "처리 중…" : "게시 확정"}
                        </button>
                        <button
                          type="button"
                          className="is-danger"
                          disabled={busyId !== null}
                          onClick={() => {
                            setRejectingId(item.id);
                            setRejectionReason("");
                          }}
                        >
                          반려
                        </button>
                      </div>
                    )}
                  </div>
                ) : item.status === "rejected" && item.rejectionReason ? (
                  <p className="classroom-banner-review-note">
                    반려 사유 · {item.rejectionReason}
                  </p>
                ) : (
                  <p className="classroom-banner-review-note">검토 완료</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
