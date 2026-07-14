"use client";

import { useEffect, useState } from "react";

type Submission = {
  id: string;
  targetDay: string;
  kind: "text" | "image";
  text: string | null;
  imageUrl: string | null;
  status: "pending" | "approved" | "rejected";
  student?: { name: string; number: number | null };
};

function todayKst() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function DailyBannerModerationPanel({
  classroomId,
}: {
  classroomId: string;
}) {
  const [day, setDay] = useState(todayKst);
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/classrooms/${encodeURIComponent(classroomId)}/daily-banners?targetDay=${day}&status=all`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`status ${response.status}`);
      const body = (await response.json()) as { submissions?: Submission[] };
      setItems(body.submissions ?? []);
    } catch {
      setMessage("신청 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [day]);

  async function moderate(id: string, action: "approve" | "reject") {
    setMessage(null);
    try {
      const response = await fetch(
        `/api/classrooms/${encodeURIComponent(classroomId)}/daily-banners/${encodeURIComponent(id)}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body:
            action === "reject"
              ? JSON.stringify({ reason: "교사 검토" })
              : undefined,
        },
      );
      if (response.status === 409 && action === "approve") {
        setMessage("이미 다른 반 배너가 이 날짜에 확정되었습니다.");
      } else if (!response.ok) {
        throw new Error(`status ${response.status}`);
      } else {
        setMessage(
          action === "approve"
            ? "전교 배너로 확정했습니다."
            : "신청을 반려했습니다.",
        );
      }
      await load();
    } catch {
      setMessage("처리하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  return (
    <section className="classroom-banner-panel">
      <div className="classroom-banner-head">
        <div>
          <h2>일일 배너 신청</h2>
          <p>승인하면 전교 학생·학부모 화면에 하루 한 개만 게시됩니다.</p>
        </div>
        <input
          type="date"
          value={day}
          onChange={(event) => setDay(event.target.value)}
          aria-label="게시 날짜"
        />
      </div>
      {message ? (
        <p className="classroom-banner-notice" role="status">
          {message}
        </p>
      ) : null}
      {loading ? (
        <p>불러오는 중…</p>
      ) : items.length === 0 ? (
        <p>이 날짜의 신청이 없습니다.</p>
      ) : (
        <div className="classroom-banner-list">
          {items.map((item) => (
            <article key={item.id} className="classroom-banner-item">
              <div>
                <strong>
                  {item.student?.name ?? "학생"}
                  {item.student?.number ? ` (${item.student.number}번)` : ""}
                </strong>
                <span>
                  {item.kind === "image"
                    ? item.text
                      ? "이미지 + 문구"
                      : "이미지"
                    : "흐르는 문구"}{" "}
                  ·{" "}
                  {item.status === "pending"
                    ? "심사 대기"
                    : item.status === "approved"
                      ? "확정"
                      : "반려"}
                </span>
                {item.kind === "image" && item.imageUrl ? (
                  <>
                    <img src={item.imageUrl} alt="학생이 신청한 배너" />
                    {item.text ? <p>{item.text}</p> : null}
                  </>
                ) : (
                  <p>{item.text}</p>
                )}
              </div>
              {item.status === "pending" ? (
                <div className="classroom-banner-actions">
                  <button
                    type="button"
                    onClick={() => void moderate(item.id, "approve")}
                  >
                    승인
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    onClick={() => void moderate(item.id, "reject")}
                  >
                    반려
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
