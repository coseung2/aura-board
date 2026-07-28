"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { StudentWalkingTabs } from "@/components/student/StudentWalkingTabs";
import type { StudentActivityView } from "@/components/student/StudentActivityHeader";

import styles from "./WalkingDashboard.module.css";

type WalkingDay = {
  day: string;
  steps: number;
  distanceMeters: number;
  syncedAt: string | null;
};

export function walkingAverageSteps(rows: WalkingDay[], today: string): number {
  const elapsedRows = rows.filter((row) => row.day <= today);
  if (elapsedRows.length === 0) return 0;
  const total = elapsedRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.steps) || 0),
    0,
  );
  return Math.round(total / elapsedRows.length);
}

type RewardTier = {
  key: string;
  steps: number;
  amount: number;
  achieved: boolean;
  claimed: boolean;
  claimable?: boolean;
  unit?: number;
};

type AttendanceReward = {
  month: string;
  monthDays: number;
  attendanceCount: number;
  visitCount?: number;
  claimedOrdinals?: number[];
  claimableAttendance?: Array<{ ordinal: number; day: string }>;
  cashPaid: number;
  itemRewardOrdinal: number;
  itemEarned: boolean;
};

type WalkingTitle = {
  key: string;
  label: string;
  imagePath: string;
  requirement: string;
  effectKey: string;
  buffBps: number;
  earned: boolean;
  claimed: boolean;
};

type ClassroomRank = {
  studentId: string;
  studentNumber: number | null;
  studentName: string;
  weeklySteps: number;
  isCurrent: boolean;
  rewardAmount: number;
};

type ClassroomRankReward = {
  weekStart: string;
  rank: number;
  amount: number;
};

type WalkingSnapshot = {
  rows: WalkingDay[];
  range: { weekStart: string; weekEnd: string };
  monthlyAttendanceReward: AttendanceReward;
  dailyStepRewards: { day: string; totalSteps: number; tiers: RewardTier[] };
  weeklyStepRewards: {
    weekStart: string;
    totalSteps: number;
    maxSteps: number;
    tiers: RewardTier[];
  };
  classroomTopFive: ClassroomRank[];
  classroomRankRewards: ClassroomRankReward[];
  classroomRankNextResetAt: string | null;
  titles: WalkingTitle[];
};

type MutationKind =
  | `daily:${number}`
  | `weekly:${string}`
  | `attendance:${string}`
  | `rank:${string}`
  | `title:${string}`;

const numberFormatter = new Intl.NumberFormat("ko-KR");
const distanceFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function kstToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dayLabel(value: string, today: string) {
  if (value === today) return "오늘";
  const [year, month, day] = value.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  return `${month}월 ${day}일(${weekday})`;
}

function requestError(payload: unknown, fallback: string) {
  const code =
    payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error: unknown }).error)
      : "";
  if (code === "reward_not_achieved") return "목표를 먼저 달성해 주세요.";
  if (code === "title_not_earned") return "아직 획득 조건을 달성하지 못했어요.";
  if (code === "already_claimed") return "이미 받은 보상이에요.";
  if (code === "unauthorized") return "로그인이 만료됐어요. 다시 로그인해 주세요.";
  return fallback;
}

async function readJson(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

async function fetchWalkingSnapshot(): Promise<WalkingSnapshot> {
  const response = await fetch("/api/student/walking?week=current", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await readJson(response);
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error(requestError(payload, "걷기 정보를 불러오지 못했어요."));
  }
  return payload as WalkingSnapshot;
}

async function fetchInitialWalkingSnapshot(): Promise<WalkingSnapshot> {
  // Preserve the web walking page's attendance visit behavior, then read the
  // walking snapshot so the UI reflects the server-confirmed attendance state.
  await fetch("/api/student/attendance", {
    method: "POST",
    credentials: "same-origin",
  }).catch(() => null);
  return fetchWalkingSnapshot();
}

function ClaimButton({
  label,
  disabled,
  busy,
  onClick,
}: {
  label: string;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.claimButton}
      disabled={disabled}
      aria-busy={busy}
      onClick={onClick}
    >
      {busy ? "확인 중…" : label}
    </button>
  );
}

export function WalkingDashboard({
  initialView = "records",
}: {
  initialView?: StudentActivityView;
}) {
  const [snapshot, setSnapshot] = useState<WalkingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState<MutationKind | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const reload = useCallback(async () => {
    const next = await fetchWalkingSnapshot();
    setSnapshot(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotice(null);
    void fetchInitialWalkingSnapshot()
      .then((next) => {
        if (active) setSnapshot(next);
      })
      .catch((error: unknown) => {
        if (active) {
          setNotice({
            kind: "error",
            text: error instanceof Error ? error.message : "걷기 정보를 불러오지 못했어요.",
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const mutate = useCallback(
    async (
      key: MutationKind,
      url: string,
      init: RequestInit,
      successText: string,
      failureText: string,
    ) => {
      if (busy) return;
      setBusy(key);
      setNotice(null);
      try {
        const response = await fetch(url, {
          credentials: "same-origin",
          ...init,
          headers: init.body
            ? { "content-type": "application/json", ...init.headers }
            : init.headers,
        });
        const payload = await readJson(response);
        if (!response.ok) throw new Error(requestError(payload, failureText));
        await reload();
        setNotice({ kind: "success", text: successText });
      } catch (error) {
        setNotice({
          kind: "error",
          text: error instanceof Error ? error.message : failureText,
        });
      } finally {
        setBusy(null);
      }
    },
    [busy, reload],
  );

  const today = kstToday();
  const confirmedRows = snapshot?.rows ?? [];
  const currentRows = useMemo(
    () => confirmedRows.filter(
      (row) =>
        !snapshot?.range ||
        (row.day >= snapshot.range.weekStart && row.day <= snapshot.range.weekEnd),
    ),
    [confirmedRows, snapshot?.range],
  );
  const todayRow = currentRows.find((row) => row.day === today);
  const totalSteps = currentRows.reduce(
    (sum, row) => (row.day <= today ? sum + Math.max(0, Number(row.steps) || 0) : sum),
    0,
  );
  const totalDistance = currentRows.reduce(
    (sum, row) => (row.day <= today ? sum + Math.max(0, Number(row.distanceMeters) || 0) : sum),
    0,
  );
  const averageSteps = walkingAverageSteps(currentRows, today);
  const maxSteps = Math.max(1, ...currentRows.map((row) => Math.max(0, Number(row.steps) || 0)));

  if (loading && !snapshot) {
    return <p className={styles.pageStatus} role="status">걷기 정보를 불러오는 중…</p>;
  }

  if (!snapshot) {
    return (
      <div className={styles.pageStatus} role="alert">
        <span>{notice?.text ?? "걷기 정보를 불러오지 못했어요."}</span>
        <button type="button" className={styles.retryButton} onClick={() => setLoadAttempt((value) => value + 1)}>
          다시 시도
        </button>
      </div>
    );
  }

  const attendance = snapshot.monthlyAttendanceReward;
  const latestSync = currentRows.reduce<string | null>((latest, row) => {
    if (!row.syncedAt) return latest;
    return !latest || new Date(row.syncedAt) > new Date(latest) ? row.syncedAt : latest;
  }, null);

  return (
    <>
      {notice ? (
        <p
          className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      ) : null}
      <StudentWalkingTabs
        initialView={initialView}
        records={
          <div className={styles.stack}>
            <section className="classroom-dashboard-kpis" aria-label="걷기 요약">
              <article className="classroom-dashboard-kpi"><span>오늘</span><strong>{numberFormatter.format(todayRow?.steps ?? 0)}걸음</strong></article>
              <article className="classroom-dashboard-kpi"><span>이번 주 합계</span><strong>{numberFormatter.format(totalSteps)}걸음</strong></article>
              <article className="classroom-dashboard-kpi"><span>하루 평균</span><strong>{numberFormatter.format(averageSteps)}걸음</strong></article>
              <article className="classroom-dashboard-kpi"><span>이동 거리</span><strong>{distanceFormatter.format(totalDistance / 1000)}km</strong></article>
            </section>

            <section className="classroom-dashboard-panel student-walking-week-chart" aria-labelledby="walking-week-title">
              <div className="classroom-dashboard-panel-head">
                <div><span>주간기록</span><h2 id="walking-week-title">이번 주 걸음 수</h2></div>
                <span>{latestSync ? `마지막 동기화 ${new Date(latestSync).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` : "아직 동기화되지 않음"}</span>
              </div>
              <p className="student-walking-week-range">{dayLabel(snapshot.range.weekStart, today)}–{dayLabel(snapshot.range.weekEnd, today)}</p>
              <div className="student-walking-days" role="list">
                {currentRows.map((row) => {
                  const future = row.day > today;
                  const steps = future ? 0 : Math.max(0, Number(row.steps) || 0);
                  return (
                    <div key={row.day} className="student-walking-day-row" role="listitem" aria-label={`${dayLabel(row.day, today)}, ${numberFormatter.format(steps)}걸음${future ? ", 아직 날짜가 오지 않았어요" : row.syncedAt ? "" : ", 미동기화"}`}>
                      <span className={`student-walking-day-label${future ? " student-walking-future-day" : ""}`}>{dayLabel(row.day, today)}</span>
                      <span className="student-walking-bar-track" aria-hidden="true"><span className="student-walking-bar-fill" style={{ width: `${Math.round((steps / maxSteps) * 100)}%`, minWidth: steps > 0 ? 4 : 0 }} /></span>
                      <strong className="student-walking-step-label">{future ? "—" : `${numberFormatter.format(steps)}걸음`}</strong>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="classroom-dashboard-panel student-walking-leaderboard" aria-labelledby="walking-rank-title">
              <div className="classroom-dashboard-panel-head"><h2 id="walking-rank-title">우리 반 Top 5</h2><span>이번 주</span></div>
              <ol className="student-walking-leaderboard-list">
                {snapshot.classroomTopFive.map((rank, index) => (
                  <li key={rank.studentId} className={rank.isCurrent ? "is-current" : undefined}>
                    <strong className="student-walking-leaderboard-rank">{index + 1}</strong>
                    <span className="student-walking-leaderboard-name">{rank.studentNumber == null ? rank.studentName : `${rank.studentNumber}번 ${rank.studentName}`}</span>
                    <span className={styles.rankMetrics}><strong className="student-walking-leaderboard-steps">{numberFormatter.format(rank.weeklySteps)}걸음</strong>{rank.rewardAmount > 0 ? <small>{numberFormatter.format(rank.rewardAmount)}원</small> : null}</span>
                  </li>
                ))}
              </ol>
              {snapshot.classroomRankRewards.length > 0 ? (
                <div className={styles.rankClaims} aria-label="받을 수 있는 지난주 순위 보상">
                  {snapshot.classroomRankRewards.map((reward) => {
                    const key = `rank:${reward.weekStart}` as const;
                    return (
                      <div className={styles.claimRow} key={reward.weekStart}>
                        <span><strong>{reward.rank}등</strong><small>{reward.weekStart} 주간 · {numberFormatter.format(reward.amount)}원</small></span>
                        <ClaimButton label="보상 받기" disabled={busy !== null} busy={busy === key} onClick={() => void mutate(key, "/api/student/walking/rewards/claim", { method: "POST", body: JSON.stringify({ kind: "classroom_rank", weekStart: reward.weekStart }) }, `${reward.rank}등 보상을 받았어요.`, "순위 보상을 받지 못했어요.")} />
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          </div>
        }
        missions={
          <div className={styles.stack}>
            <section className="classroom-dashboard-panel" aria-labelledby="walking-attendance-title">
              <div className="classroom-dashboard-panel-head"><h2 id="walking-attendance-title">월간 출석</h2><strong>{attendance.attendanceCount}/{attendance.monthDays}일</strong></div>
              <p className={styles.summaryText}>방문 {attendance.visitCount ?? attendance.attendanceCount}일 · 받은 현금 {numberFormatter.format(attendance.cashPaid)}원{attendance.itemEarned ? " · 쿠키 획득" : ""}</p>
              {(attendance.claimableAttendance ?? []).length > 0 ? (
                <div className={styles.claimList}>
                  {(attendance.claimableAttendance ?? []).map((entry) => {
                    const key = `attendance:${entry.day}` as const;
                    return <div className={styles.claimRow} key={entry.day}><span><strong>{entry.ordinal}번째 출석</strong><small>{entry.day}</small></span><ClaimButton label="출석 보상 받기" disabled={busy !== null} busy={busy === key} onClick={() => void mutate(key, "/api/student/attendance", { method: "PATCH", body: JSON.stringify({ day: entry.day }) }, "출석 보상을 받았어요.", "출석 보상을 받지 못했어요.")} /></div>;
                  })}
                </div>
              ) : <p className={styles.emptyText}>지금 받을 수 있는 출석 보상이 없어요.</p>}
            </section>

            <RewardSection title="일간미션" tiers={snapshot.dailyStepRewards.tiers} totalSteps={snapshot.dailyStepRewards.totalSteps} busy={busy} onClaim={(tier) => {
              const unit = tier.unit ?? Number(tier.key.replace(/\D/g, ""));
              const key = `daily:${unit}` as const;
              return mutate(key, "/api/student/walking/rewards/claim", { method: "POST", body: JSON.stringify({ kind: "daily", unit }) }, "일간 보상을 받았어요.", "일간 보상을 받지 못했어요.");
            }} kind="daily" />

            <RewardSection title="주간미션" tiers={snapshot.weeklyStepRewards.tiers} totalSteps={snapshot.weeklyStepRewards.totalSteps} busy={busy} onClaim={(tier) => {
              const key = `weekly:${tier.key}` as const;
              return mutate(key, "/api/student/walking/rewards/claim", { method: "POST", body: JSON.stringify({ kind: "weekly", tierKey: tier.key }) }, "주간 보상을 받았어요.", "주간 보상을 받지 못했어요.");
            }} kind="weekly" />

            <section className="classroom-dashboard-panel" aria-labelledby="walking-titles-title">
              <div className="classroom-dashboard-panel-head"><h2 id="walking-titles-title">걷기 칭호</h2><span>{snapshot.titles.filter((title) => title.claimed).length}/{snapshot.titles.length} 수령</span></div>
              <div className={styles.titleGrid}>
                {snapshot.titles.map((title) => {
                  const key = `title:${title.key}` as const;
                  return (
                    <article className={`${styles.titleCard} ${title.claimed ? styles.titleClaimed : title.earned ? styles.titleClaimable : ""}`} key={title.key}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={title.imagePath} alt="" aria-hidden="true" />
                      <div><h3>{title.label}</h3><p>{title.requirement}</p><small>효과 +{(title.buffBps / 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%</small></div>
                      <ClaimButton label={title.claimed ? "수령 완료" : title.earned ? "칭호 받기" : "미달성"} disabled={busy !== null || !title.earned || title.claimed} busy={busy === key} onClick={() => void mutate(key, "/api/student/titles", { method: "POST", body: JSON.stringify({ titleKey: title.key }) }, "칭호를 받았어요. 펫 꾸미기에서 붙일 수 있어요.", "칭호를 받지 못했어요.")} />
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        }
      />
    </>
  );
}

function RewardSection({
  title,
  tiers,
  totalSteps,
  busy,
  onClaim,
  kind,
}: {
  title: string;
  tiers: RewardTier[];
  totalSteps: number;
  busy: MutationKind | null;
  onClaim: (tier: RewardTier) => Promise<void>;
  kind: "daily" | "weekly";
}) {
  return (
    <section className="classroom-dashboard-panel" aria-label={title}>
      <div className="classroom-dashboard-panel-head"><h2>{title}</h2><strong>{numberFormatter.format(totalSteps)}걸음</strong></div>
      <div className={styles.claimList}>
        {tiers.map((tier, index) => {
          const claimable = tier.claimable ?? tier.achieved;
          const key = kind === "daily" ? `daily:${tier.unit ?? Number(tier.key.replace(/\D/g, ""))}` : `weekly:${tier.key}`;
          return (
            <div
              className={styles.claimRow}
              key={`${kind}:${tier.key}:${tier.unit ?? tier.steps}:${index}`}
            >
              <span><strong>{numberFormatter.format(tier.steps)}걸음</strong><small>{numberFormatter.format(tier.amount)}원</small></span>
              <ClaimButton label={tier.claimed ? "수령 완료" : claimable ? "보상 받기" : "미달성"} disabled={busy !== null || tier.claimed || !claimable} busy={busy === key} onClick={() => void onClaim(tier)} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
