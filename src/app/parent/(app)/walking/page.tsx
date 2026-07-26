"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

const numberFormatter = new Intl.NumberFormat("ko-KR");

type Week = {
  weekStart: string;
  weekEnd: string;
  today: string;
};

type WalkingChild = {
  studentId: string;
  name: string;
  number: number | null;
  classroom: { id: string; name: string } | null;
  rows: Array<{
    day: string;
    steps: number;
    distanceMeters: number;
    syncedAt: string | null;
  }>;
};

type WalkingResponse = {
  week: Week;
  children: WalkingChild[];
};

type Day = {
  day: string;
  steps: number;
  future: boolean;
};

function addDays(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function weekDays(week: Week): Day[] {
  const rows: Day[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const day = addDays(week.weekStart, offset);
    rows.push({ day, steps: 0, future: day > week.today });
  }
  return rows;
}

function childDays(child: WalkingChild, week: Week) {
  const stepsByDay = new Map(
    child.rows.map((row) => [row.day, Math.max(0, Number(row.steps) || 0)]),
  );
  return weekDays(week).map((day) => ({
    ...day,
    steps: stepsByDay.get(day.day) ?? 0,
  }));
}

function dayLabel(day: string, today: string) {
  if (day === today) return "오늘";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(`${day}T12:00:00.000Z`));
}

function formatRange(week: Week) {
  const start = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(`${week.weekStart}T12:00:00.000Z`));
  const end = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(`${week.weekEnd}T12:00:00.000Z`));
  return `${start} – ${end}`;
}

function metrics(days: Day[], today: string) {
  const elapsed = days.filter((day) => !day.future && day.day <= today);
  const weekly = elapsed.reduce((total, day) => total + day.steps, 0);
  return {
    today: elapsed.find((day) => day.day === today)?.steps ?? 0,
    weekly,
    average: elapsed.length > 0 ? Math.round(weekly / elapsed.length) : 0,
    elapsedDays: elapsed.length,
  };
}

function errorMessage(status: number | null) {
  if (status === 403) return "걷기 기록을 볼 권한이 없어요.";
  if (status !== null && status >= 500) {
    return "걷기 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
  return "걷기 기록을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
}

export default function ParentWalkingPage() {
  const { replace } = useRouter();
  const [data, setData] = useState<WalkingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/parent/walking", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | WalkingResponse
        | { error?: unknown }
        | null;

      if (response.status === 401) {
        replace("/login?role=parent&error=session_required");
        return;
      }
      if (!response.ok) {
        throw { status: response.status };
      }
      if (
        !payload ||
        !("week" in payload) ||
        !payload.week ||
        !Array.isArray(payload.children)
      ) {
        throw { status: null };
      }
      setData(payload);
    } catch (caught) {
      const status =
        typeof caught === "object" && caught !== null && "status" in caught
          ? typeof caught.status === "number"
            ? caught.status
            : null
          : null;
      setError(errorMessage(status));
    } finally {
      setLoading(false);
    }
  }, [replace]);

  useEffect(() => {
    void load();
  }, [load]);

  const rangeLabel = useMemo(
    () => (data ? formatRange(data.week) : "이번 주 기록"),
    [data],
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>자녀 활동</p>
          <h1>걷기 기록</h1>
          <p className={styles.subtitle}>
            오늘의 걸음과 이번 주 활동을 한눈에 확인해 보세요.
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.rangeLabel}>{rangeLabel}</span>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "불러오는 중…" : "새로고침"}
          </button>
        </div>
      </header>

      {error ? (
        <section className={styles.state} role="alert" aria-live="polite">
          <span className={styles.stateIcon} aria-hidden>
            !
          </span>
          <h2>기록을 불러오지 못했어요</h2>
          <p>{error}</p>
          <button type="button" className={styles.primaryButton} onClick={() => void load()}>
            다시 시도
          </button>
        </section>
      ) : loading && !data ? (
        <div className={styles.skeletonList} aria-label="걷기 기록 불러오는 중" aria-busy="true">
          <span className={styles.skeletonHeading} />
          <span className={styles.skeletonCard} />
          <span className={styles.skeletonCard} />
        </div>
      ) : data?.children.length === 0 ? (
        <section className={styles.state} aria-labelledby="walking-empty-title">
          <span className={styles.stateIcon} aria-hidden>
            +
          </span>
          <h2 id="walking-empty-title">연결된 자녀가 없어요</h2>
          <p>자녀를 연결하면 자녀의 오늘 걸음과 주간 활동을 확인할 수 있어요.</p>
          <Link className={styles.primaryButton} href="/parent/onboard/match/code">
            자녀 연결하기
          </Link>
        </section>
      ) : data ? (
        <section aria-labelledby="walking-children-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>연결된 자녀</p>
              <h2 id="walking-children-title">자녀별 걷기 기록</h2>
            </div>
            <span>{data.children.length}명</span>
          </div>
          <div className={styles.children}>
            {data.children.map((child) => (
              <ChildWalkingCard key={child.studentId} child={child} week={data.week} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ChildWalkingCard({ child, week }: { child: WalkingChild; week: Week }) {
  const days = childDays(child, week);
  const summary = metrics(days, week.today);
  const maxSteps = Math.max(1, ...days.map((day) => day.steps));
  const childMeta = [
    child.number !== null ? `${child.number}번` : null,
    child.classroom?.name ?? "반 정보 없음",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className={styles.card} aria-label={`${child.name} 걷기 기록`}>
      <header className={styles.cardHeader}>
        <div>
          <h3>{child.name}</h3>
          <p>{childMeta}</p>
        </div>
        <span className={styles.footprint} aria-hidden>
          ●
        </span>
      </header>

      <div className={styles.metrics} aria-label={`${child.name} 걸음 요약`}>
        <Metric label="오늘" value={summary.today} />
        <Metric label="이번 주" value={summary.weekly} />
        <Metric label="일평균" value={summary.average} />
      </div>

      <div className={styles.chartHeader}>
        <h4>이번 주 일별 기록</h4>
        <span>{summary.elapsedDays}일 기준 평균</span>
      </div>
      <div className={styles.chart} role="list" aria-label={`${child.name} 이번 주 일별 걸음`}>
        {days.map((day) => (
          <div
            key={day.day}
            className={`${styles.day} ${day.future ? styles.futureDay : ""}`}
            role="listitem"
            aria-label={`${dayLabel(day.day, week.today)} ${day.future ? "기록 예정" : `${numberFormatter.format(day.steps)}걸음`}`}
          >
            <span className={styles.dayLabel}>{dayLabel(day.day, week.today)}</span>
            <span className={styles.barTrack} aria-hidden>
              <span className={styles.barFill} style={{ height: `${Math.round((day.steps / maxSteps) * 100)}%` }} />
            </span>
            <strong>{day.future ? "–" : numberFormatter.format(day.steps)}</strong>
          </div>
        ))}
      </div>
      {summary.weekly === 0 ? (
        <p className={styles.noData}>이번 주에는 아직 기록이 없어요.</p>
      ) : null}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{numberFormatter.format(value)}</strong>
      <small>걸음</small>
    </div>
  );
}
