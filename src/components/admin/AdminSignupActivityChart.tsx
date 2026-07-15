"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronsRightIcon } from "@/components/icons/UiIcons";

export type AdminTrendPoint = {
  date: string;
  signups: number;
  boardActivities: number;
};

type Period = "day" | "week" | "month";

type ChartBucket = {
  key: string;
  label: string;
  signups: number;
  boardActivities: number;
};

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: "day", label: "일" },
  { key: "week", label: "주" },
  { key: "month", label: "월" },
];

const BAR_WIDTH_PX = 8;
const BAR_GAP_PX = 6;
const CHART_INSET_PX = 34;
const MIN_CHART_WIDTH_PX = 260;

export function AdminSignupActivityChart({
  points,
}: {
  points: AdminTrendPoint[];
}) {
  const [period, setPeriod] = useState<Period>("month");
  const [viewportWidth, setViewportWidth] = useState(MIN_CHART_WIDTH_PX);
  const [canJumpToLatest, setCanJumpToLatest] = useState(false);
  const [dragging, setDragging] = useState(false);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startLeft: number } | null>(null);
  const buckets = useMemo(() => buildBuckets(points, period), [period, points]);
  const maxSignups = Math.max(...buckets.map((bucket) => bucket.signups), 1);
  const maxActivities = Math.max(
    ...buckets.map((bucket) => bucket.boardActivities),
    1,
  );
  const signupAxisMax = niceAxisMax(maxSignups);
  const activityAxisMax = niceAxisMax(maxActivities);
  const chartSeriesWidth = Math.max(
    0,
    buckets.length * BAR_WIDTH_PX + Math.max(0, buckets.length - 1) * BAR_GAP_PX,
  );
  const chartWidth = Math.max(
    viewportWidth,
    chartSeriesWidth + CHART_INSET_PX * 2,
  );
  const seriesOffset = Math.max(
    CHART_INSET_PX,
    chartWidth - CHART_INSET_PX - chartSeriesWidth,
  );
  const linePoints = buckets
    .map((bucket, index) => {
      const x = seriesOffset + index * (BAR_WIDTH_PX + BAR_GAP_PX) + BAR_WIDTH_PX / 2;
      const y = 100 - (bucket.boardActivities / activityAxisMax) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportWidth(Math.max(MIN_CHART_WIDTH_PX, Math.floor(entry.contentRect.width)));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => scrollToLatest("auto"));
    return () => cancelAnimationFrame(frame);
  }, [period, buckets.length, chartWidth]);

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

  function updateLatestAffordance() {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;
    setCanJumpToLatest(
      viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 2,
    );
  }

  function scrollToLatest(behavior: ScrollBehavior) {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({
      left: viewport.scrollWidth - viewport.clientWidth,
      behavior,
    });
    requestAnimationFrame(updateLatestAffordance);
  }

  function handleChartPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = scrollViewportRef.current;
    if (!viewport || event.button !== 0 || viewport.scrollWidth <= viewport.clientWidth) {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startLeft: viewport.scrollLeft,
    };
    viewport.setPointerCapture(event.pointerId);
    setDragging(true);
    event.preventDefault();
  }

  function handleChartPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = scrollViewportRef.current;
    const drag = dragRef.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    viewport.scrollLeft = drag.startLeft - (event.clientX - drag.startX);
    updateLatestAffordance();
  }

  function finishChartDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = scrollViewportRef.current;
    const drag = dragRef.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
    updateLatestAffordance();
  }

  return (
    <section
      className="admin-section admin-trend-panel"
      aria-labelledby="admin-signup-trend-title"
    >
      <div className="admin-section-head admin-trend-head">
        <div>
          <h2 id="admin-signup-trend-title">가입 추이</h2>
        </div>
      </div>

      <div className="admin-trend-controls">
        <div className="admin-trend-legend" aria-label="차트 범례">
          <span><i className="is-bars" />가입자</span>
          <span><i className="is-line" />보드 활동 이력</span>
        </div>
        <nav className="admin-period-nav" aria-label="가입 추이 기간">
          <div role="tablist">
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
        </nav>
      </div>
      <div
        id="admin-signup-trend-panel"
        className="admin-combined-chart"
        role="tabpanel"
        aria-labelledby={`admin-trend-tab-${period}`}
      >
        <div className="admin-combined-chart-frame">
          <ChartAxis side="left" label="가입자" values={axisValues(signupAxisMax)} />
          <ChartAxis side="right" label="보드 활동" values={axisValues(activityAxisMax)} />
          {canJumpToLatest ? (
            <button
              type="button"
              className="admin-chart-jump-latest"
              onClick={() => scrollToLatest("smooth")}
              aria-label="가장 최근 기간으로 이동"
              title="가장 최근 기간으로 이동"
            >
              <ChevronsRightIcon size={18} />
            </button>
          ) : null}
          <div
            ref={scrollViewportRef}
            className={`admin-combined-chart-scroll${dragging ? " is-dragging" : ""}`}
            role="region"
            aria-label="가입 추이 차트. 마우스로 좌우로 드래그해 이전 기간을 볼 수 있습니다."
            tabIndex={0}
            onScroll={updateLatestAffordance}
            onPointerDown={handleChartPointerDown}
            onPointerMove={handleChartPointerMove}
            onPointerUp={finishChartDrag}
            onPointerCancel={finishChartDrag}
          >
            <div className="admin-combined-chart-canvas" style={{ width: chartWidth }}>
        <div
          className="admin-combined-chart-plot"
          role="img"
          aria-label={`${PERIODS.find((item) => item.key === period)?.label ?? "월"} 단위 가입자와 보드 활동 추이`}
          style={{
            gridTemplateColumns: `repeat(${buckets.length}, ${BAR_WIDTH_PX}px)`,
            columnGap: BAR_GAP_PX,
            paddingLeft: seriesOffset,
            paddingRight: CHART_INSET_PX,
            backgroundImage:
              "linear-gradient(to bottom, rgba(24, 74, 92, 0.09) 0 1px, transparent 1px calc(50% - 1px), rgba(24, 74, 92, 0.09) calc(50% - 1px) 50%, transparent 50% calc(100% - 1px), rgba(24, 74, 92, 0.09) calc(100% - 1px) 100%), repeating-linear-gradient(to right, rgba(24, 74, 92, 0.07) 0 1px, transparent 1px 14px)",
            backgroundPosition: `0 0, ${seriesOffset}px 0`,
          }}
        >
          {buckets.map((bucket) => (
            <div key={bucket.key} className="admin-combined-chart-column">
              <span
                className="admin-combined-chart-bar"
                style={{ height: `${Math.max(3, (bucket.signups / signupAxisMax) * 100)}%` }}
                title={`${bucket.label}: 가입 ${bucket.signups}명, 보드 활동 ${bucket.boardActivities}건`}
              />
            </div>
          ))}
          <svg
            className="admin-combined-chart-line"
            viewBox={`0 0 ${chartWidth} 100`}
            preserveAspectRatio="none"
            aria-hidden="true"
            width="100%"
            height="100%"
          >
            <polyline points={linePoints} />
          </svg>
          <div className="admin-combined-chart-marker-layer" aria-hidden="true">
            {buckets.map((bucket, index) => {
              const x = seriesOffset + index * (BAR_WIDTH_PX + BAR_GAP_PX) + BAR_WIDTH_PX / 2;
              const y = 100 - (bucket.boardActivities / activityAxisMax) * 100;
              return (
                <span
                  key={bucket.key}
                  className="admin-combined-chart-marker"
                  style={{ left: x, top: `${y}%` }}
                />
              );
            })}
          </div>
        </div>
        <div
          className="admin-combined-chart-labels"
          style={{
            gridTemplateColumns: `repeat(${buckets.length}, ${BAR_WIDTH_PX}px)`,
            columnGap: BAR_GAP_PX,
            paddingLeft: seriesOffset,
            paddingRight: CHART_INSET_PX,
          }}
          aria-hidden="true"
        >
          {buckets.map((bucket, index) => (
            <span key={bucket.key}>
              {shouldShowLabel(period, index, buckets.length) ? bucket.label : ""}
            </span>
          ))}
        </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChartAxis({
  side,
  label,
  values,
}: {
  side: "left" | "right";
  label: string;
  values: Array<number | null>;
}) {
  return (
    <div className={`admin-combined-chart-axis is-${side}`} aria-hidden="true">
      <span className="admin-combined-chart-axis-label">{label}</span>
      <div className="admin-combined-chart-axis-values">
        {values.map((value, index) => (
          <span key={`${value ?? "empty"}-${index}`}>
            {value === null ? null : value.toLocaleString("ko-KR")}
          </span>
        ))}
      </div>
    </div>
  );
}

function axisValues(max: number): Array<number | null> {
  return [max, Math.round(max / 2), null];
}

function niceAxisMax(value: number): number {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function buildBuckets(points: AdminTrendPoint[], period: Period): ChartBucket[] {
  const buckets = new Map<string, ChartBucket>();
  for (const point of points) {
    const { key, label } = bucketMeta(point.date, period);
    const current = buckets.get(key) ?? {
      key,
      label,
      signups: 0,
      boardActivities: 0,
    };
    current.signups += point.signups;
    current.boardActivities += point.boardActivities;
    buckets.set(key, current);
  }
  return [...buckets.values()];
}

function bucketMeta(dateString: string, period: Period): { key: string; label: string } {
  if (period === "day") {
    const [, month, day] = dateString.split("-");
    return {
      key: dateString,
      label: `${Number(month)}/${Number(day)}`,
    };
  }

  if (period === "month") {
    const [, month] = dateString.split("-");
    return {
      key: dateString.slice(0, 7),
      label: `${Number(month)}월`,
    };
  }

  const date = new Date(`${dateString}T00:00:00Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  const key = date.toISOString().slice(0, 10);
  const [, month, day] = key.split("-");
  return {
    key,
    label: `${Number(month)}/${Number(day)}`,
  };
}

function shouldShowLabel(period: Period, index: number, length: number): boolean {
  const labelStep = period === "day" ? 10 : period === "week" ? 4 : 1;
  return index % labelStep === 0 || index === length - 1;
}
