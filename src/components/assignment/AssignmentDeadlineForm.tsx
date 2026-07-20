"use client";

import { useEffect, useState } from "react";

type Props = {
  boardId: string;
  deadline: string | null;
  slotCount: number;
  onSaved: (dueAt: string) => void;
};

type DistributionResponse = {
  distribution?: { dueAt?: unknown; slotCount?: unknown };
  error?: unknown;
};

/** Format an absolute instant for the browser's local datetime-local input. */
export function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Convert datetime-local (which has no timezone) to an offset-aware ISO value.
 * The selected wall-clock value is interpreted in the browser's local zone;
 * preserving the offset lets the API validate it and persist the exact instant.
 */
export function localDateTimeToOffsetIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    0,
  );
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day) ||
    date.getHours() !== Number(hour) ||
    date.getMinutes() !== Number(minute) ||
    date.getSeconds() !== Number(second)
  ) {
    return null;
  }

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const offsetRemainder = String(absoluteOffset % 60).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHours}:${offsetRemainder}`;
}

export function formatDeadlineKst(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function errorMessage(error: unknown): string {
  switch (error) {
    case "validation_failed":
      return "제출 기한을 확인해 주세요.";
    case "not_classroom_teacher":
      return "이 보드의 담당 선생님만 기한을 정할 수 있어요.";
    default:
      return "제출 기한을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
}

export function AssignmentDeadlineForm({
  boardId,
  deadline,
  slotCount,
  onSaved,
}: Props) {
  const [value, setValue] = useState(() => toDateTimeLocalValue(deadline));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setValue(toDateTimeLocalValue(deadline));
  }, [deadline]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);

    const dueAt = localDateTimeToOffsetIso(value);
    if (!dueAt) {
      setError("제출 기한을 입력해 주세요.");
      return;
    }
    if (new Date(dueAt).getTime() <= Date.now()) {
      setError("제출 기한은 현재 시각 이후로 설정해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/assignment-slots`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dueAt }),
      });
      const body = ((await res.json().catch(() => ({}))) ?? {}) as DistributionResponse;
      if (!res.ok) {
        setError(errorMessage(body.error));
        return;
      }
      const savedDueAt =
        typeof body.distribution?.dueAt === "string" ? body.distribution.dueAt : dueAt;
      setValue(toDateTimeLocalValue(savedDueAt));
      setNotice(
        slotCount > 0
          ? `${slotCount}명에게 제출 기한을 적용했어요.`
          : "제출 기한을 저장했어요. 학생이 추가되면 적용됩니다.",
      );
      onSaved(savedDueAt);
    } catch {
      setError("네트워크 오류로 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const currentDeadline = formatDeadlineKst(deadline);

  return (
    <section className="assign-deadline" aria-labelledby="assign-deadline-title">
      <div className="assign-deadline__header">
        <div>
          <p className="assign-deadline__eyebrow">과제 배부</p>
          <h2 id="assign-deadline-title" className="assign-deadline__title">
            제출 기한
          </h2>
        </div>
        {currentDeadline ? (
          <span className="assign-deadline__current">현재 {currentDeadline} KST</span>
        ) : null}
      </div>
      <form onSubmit={submit} className="assign-deadline__form">
        <div className="assign-deadline__field">
          <label htmlFor="assignment-deadline">제출 기한(내 기기 시간)</label>
          <input
            id="assignment-deadline"
            name="assignmentDeadline"
            type="datetime-local"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
            disabled={busy}
            aria-invalid={Boolean(error)}
            aria-describedby="assignment-deadline-help assignment-deadline-error"
          />
          <span id="assignment-deadline-help" className="assign-deadline__help">
            학생에게는 한국 시간(KST)으로 표시돼요.
          </span>
        </div>
        <button type="submit" className="assign-btn assign-btn--primary" disabled={busy}>
          {busy ? "적용 중…" : currentDeadline ? "기한 다시 적용" : "기한 적용"}
        </button>
      </form>
      {error ? (
        <p id="assignment-deadline-error" className="assign-deadline__error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="assign-deadline__notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
