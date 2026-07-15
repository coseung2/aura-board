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

function todayKst() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function statusLabel(status: Submission["status"]) {
  if (status === "approved") return "게시 확정";
  if (status === "rejected") return "반려";
  return "검토 대기";
}

export function DailyBannerModerationPanel({
  classroomId,
}: {
  classroomId: string;
}) {
  const [day, setDay] = useState(todayKst);
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
        `/api/classrooms/${encodeURIComponent(classroomId)}/daily-banners?targetDay=${day}&status=all`,
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
  }, [day]);

  const counts = useMemo(
    () => ({
      pending: items.filter((item) => item.status === "pending").length,
      approved: items.filter((item) => item.status === "approved").length,
      rejected: items.filter((item) => item.status === "rejected").length,
    }),
    [items],
  );

  const visibleItems = useMemo(() => {
    if (filter === "pending") {
      return items.filter((item) => item.status === "pending");
    }
    if (filter === "reviewed") {
      return items.filter((item) => item.status !== "pending");
    }
    return items;
  }, [filter, items]);

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
        setMessage("이 학급에는 이미 해당 날짜의 배너가 확정되었습니다.");
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
        <div>
          <p className="classroom-feature-eyebrow">게시 날짜</p>
          <input
            type="date"
            value={day}
            onChange={(event) => setDay(event.target.value)}
            aria-label="게시 날짜"
          />
        </div>
        <p>
          승인한 배너는 해당 날짜에 이 학급의 학생·학부모 앱에 노출됩니다.
        </p>
      </div>

      <div className="classroom-banner-summary" aria-label="배너 검토 요약">
        <span><strong>{counts.pending}</strong> 검토 대기</span>
        <span><strong>{counts.approved}</strong> 게시 확정</span>
        <span><strong>{counts.rejected}</strong> 반려</span>
      </div>

      <div className="classroom-banner-list-head">
        <div>
          <h2 id="banner-review-title">학생 제안</h2>
          <p>내용을 확인한 뒤 게시 확정 또는 반려하세요.</p>
        </div>
        <div className="classroom-banner-filters" role="group" aria-label="검토 상태 필터">
          {([
            ["pending", `대기 ${counts.pending}`],
            ["reviewed", `처리 ${counts.approved + counts.rejected}`],
            ["all", `전체 ${items.length}`],
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
            ? "이 날짜에 기다리는 제안이 없습니다."
            : "이 조건에 맞는 제안이 없습니다."}
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
