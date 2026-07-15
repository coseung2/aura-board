"use client";

import { useMemo, useState, type KeyboardEvent } from "react";

export type AdminTrendPoint = {
  date: string;
  signups: number;
  boardActivities: number;
};

type Period = "week" | "month" | "year";

type ChartBucket = {
  key: string;
  label: string;
  signups: number;
  boardActivities: number;
};

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: "week", label: "주" },
  { key: "month", label: "월" },
  { key: "year", label: "년" },
];

export function AdminSignupActivityChart({
  points,
}: {
  points: AdminTrendPoint[];
}) {
  const [period, setPeriod] = useState<Period>("month");
  const buckets = useMemo(() => buildBuckets(points, period), [period, points]);
  const maxSignups = Math.max(...buckets.map((bucket) => bucket.signups), 1);
  const maxActivities = Math.max(
    ...buckets.map((bucket) => bucket.boardActivities),
    1,
  );
  const linePoints = buckets
    .map((bucket, index) => {
      const x = ((index + 0.5) / buckets.length) * 100;
      const y = 100 - (bucket.boardActivities / maxActivities) * 92 - 4;
      return `${x},${y}`;
    })
    .join(" ");

  function selectPeriod(nextPeriod: Period) {
    setPeriod(nextPeriod);
    requestAnimationFrame(() => {
      document.getElementById(`admin-trend-tab-${nextPeriod}`)?.focus();
    });
  }

  function handlePeriodKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = PERIODS.findIndex((item) => item.key === period);
    if (event.key === "Home") {
      event.preventDefault();
      selectPeriod(PERIODS[0].key);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      selectPeriod(PERIODS[PERIODS.length - 1].key);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const offset = event.key === "ArrowLeft" ? -1 : 1;
    const nextIndex = (currentIndex + offset + PERIODS.length) % PERIODS.length;
    selectPeriod(PERIODS[nextIndex].key);
  }

  return (
    <section
      className="admin-section admin-trend-panel"
      aria-labelledby="admin-signup-trend-title"
    >
      <div className="admin-section-head admin-trend-head">
        <div>
          <h2 id="admin-signup-trend-title">가입 추이</h2>
          <p>가입자와 최근 보드 활동 이력</p>
        </div>
        <div className="admin-period-nav" role="tablist" aria-label="가입 추이 기간">
          {PERIODS.map((item) => {
            const selected = period === item.key;
            return (
              <button
                key={item.key}
                id={`admin-trend-tab-${item.key}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="admin-signup-trend-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setPeriod(item.key)}
                onKeyDown={handlePeriodKeyDown}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="admin-trend-legend" aria-label="차트 범례">
        <span><i className="is-bars" />가입자</span>
        <span><i className="is-line" />보드 활동 이력</span>
      </div>
      <div
        id="admin-signup-trend-panel"
        className="admin-combined-chart"
        role="tabpanel"
        aria-labelledby={`admin-trend-tab-${period}`}
      >
        <div
          className="admin-combined-chart-plot"
          role="img"
          aria-label={`${PERIODS.find((item) => item.key === period)?.label ?? "월"} 단위 가입자와 보드 활동 추이`}
          style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}
        >
          {buckets.map((bucket) => (
            <div key={bucket.key} className="admin-combined-chart-column">
              <span
                className="admin-combined-chart-bar"
                style={{ height: `${Math.max(3, (bucket.signups / maxSignups) * 100)}%` }}
                title={`${bucket.label}: 가입 ${bucket.signups}명, 보드 활동 ${bucket.boardActivities}건`}
              />
            </div>
          ))}
          <svg
            className="admin-combined-chart-line"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline points={linePoints} />
            {buckets.map((bucket, index) => {
              const x = ((index + 0.5) / buckets.length) * 100;
              const y = 100 - (bucket.boardActivities / maxActivities) * 92 - 4;
              return <circle key={bucket.key} cx={x} cy={y} r="1.8" />;
            })}
          </svg>
        </div>
        <div
          className="admin-combined-chart-labels"
          style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}
          aria-hidden="true"
        >
          {buckets.map((bucket, index) => (
            <span key={bucket.key}>
              {shouldShowLabel(period, index, buckets.length) ? bucket.label : ""}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function buildBuckets(points: AdminTrendPoint[], period: Period): ChartBucket[] {
  if (period === "week") {
    return points.slice(-7).map((point) => toDayBucket(point));
  }
  if (period === "month") {
    return points.slice(-30).map((point) => toDayBucket(point));
  }

  const latestMonth = points.at(-1)?.date.slice(0, 7);
  if (!latestMonth) return [];
  const [latestYear, latestMonthNumber] = latestMonth.split("-").map(Number);
  const firstMonth = new Date(Date.UTC(latestYear, latestMonthNumber - 12, 1))
    .toISOString()
    .slice(0, 7);
  const months = new Map<string, ChartBucket>();
  for (const point of points) {
    const key = point.date.slice(0, 7);
    if (key < firstMonth) continue;
    const current = months.get(key) ?? {
      key,
      label: `${Number(key.slice(5, 7))}월`,
      signups: 0,
      boardActivities: 0,
    };
    current.signups += point.signups;
    current.boardActivities += point.boardActivities;
    months.set(key, current);
  }
  return [...months.values()];
}

function toDayBucket(point: AdminTrendPoint): ChartBucket {
  const [, month, day] = point.date.split("-");
  return {
    key: point.date,
    label: `${Number(month)}/${Number(day)}`,
    signups: point.signups,
    boardActivities: point.boardActivities,
  };
}

function shouldShowLabel(period: Period, index: number, length: number): boolean {
  if (period === "week" || period === "year") return true;
  return index % 5 === 0 || index === length - 1;
}
