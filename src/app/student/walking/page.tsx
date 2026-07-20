import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { loadRewardPolicy } from "@/lib/reward-service";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentHomePayload } from "@/lib/student-home";
import {
  addWalkingDays,
  getStudentWalkingDays,
  getWalkingDayKey,
  type WalkingDay,
} from "@/lib/walking";
import { getWalkingWeeklyRewardTiers } from "@/lib/reward-policy";
import { StudentTopNav } from "@/components/StudentTopNav";
import { StudentActivityHeader } from "@/components/student/StudentActivityHeader";

const numberFormatter = new Intl.NumberFormat("ko-KR");
const distanceFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function getCurrentWeekRange() {
  const today = getWalkingDayKey();
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const weekStart = addWalkingDays(today, -daysSinceMonday);
  return {
    weekStart,
    weekEnd: addWalkingDays(weekStart, 6),
    today,
  };
}

function fillDays(rows: WalkingDay[], weekStart: string) {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: 7 }, (_, index) => {
    const key = addWalkingDays(weekStart, index);
    return byDay.get(key) ?? {
      day: key,
      steps: 0,
      distanceMeters: 0,
      syncedAt: null,
    };
  });
}

function formatDay(value: string, today: string) {
  if (value === today) return "오늘";
  const [year, month, day] = value.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  return `${month}월 ${day}일(${weekday})`;
}

function formatWeekRange(weekStart: string, weekEnd: string) {
  return `${formatDay(weekStart, "")}–${formatDay(weekEnd, "")}`;
}

export default async function StudentWalkingPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/walking");

  const [home, storedRows, rewardPolicy] = await Promise.all([
    getStudentHomePayload(student),
    getStudentWalkingDays(student.id, 7),
    db.$transaction((tx) => loadRewardPolicy(tx, student.classroomId)),
  ]);
  const weeklyTiers = getWalkingWeeklyRewardTiers(rewardPolicy);
  const weeklyRewardTotal = weeklyTiers.reduce((sum, tier) => sum + tier.amount, 0);
  const weekRange = getCurrentWeekRange();
  const rows = fillDays(storedRows, weekRange.weekStart);
  const today = rows.find((row) => row.day === weekRange.today) ?? rows[0];
  const totalSteps = rows.reduce(
    (sum, row) => (row.day <= weekRange.today ? sum + row.steps : sum),
    0,
  );
  const totalDistance = rows.reduce(
    (sum, row) => (row.day <= weekRange.today ? sum + row.distanceMeters : sum),
    0,
  );
  const averageSteps = Math.round(totalSteps / rows.length);
  const maxSteps = Math.max(
    1,
    ...rows.filter((row) => row.day <= weekRange.today).map((row) => row.steps),
  );
  const latestSync = storedRows.reduce<string | null>((latest, row) => {
    if (row.day < weekRange.weekStart || row.day > weekRange.today) return latest;
    if (!row.syncedAt) return latest;
    if (!latest) return row.syncedAt;
    return new Date(row.syncedAt) > new Date(latest) ? row.syncedAt : latest;
  }, null);
  const hasSyncedData = rows.some(
    (row) => row.day >= weekRange.weekStart && row.day <= weekRange.today && row.syncedAt,
  );
  const reachedTier = [...weeklyTiers]
    .reverse()
    .find((tier) => totalSteps >= tier.steps);
  const nextTier = weeklyTiers.find((tier) => totalSteps < tier.steps);
  const reachedAmount = reachedTier
    ? weeklyTiers.slice(
        0,
        weeklyTiers.findIndex((tier) => tier.key === reachedTier.key) + 1,
      ).reduce((sum, tier) => sum + tier.amount, 0)
    : 0;

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={home.duties}
      />
      <main className="student-page student-walking-page">
        <StudentActivityHeader active="walking" />

        {!hasSyncedData ? (
          <section className="classroom-dashboard-panel" aria-labelledby="walking-empty-title">
            <div className="classroom-dashboard-panel-head">
              <div>
                <h2 id="walking-empty-title">아직 동기화된 걷기 기록이 없습니다</h2>
              </div>
            </div>
          </section>
        ) : null}

        <section className="classroom-dashboard-kpis" aria-label="걷기 요약">
          <article className="classroom-dashboard-kpi">
            <span>오늘</span>
            <strong>{numberFormatter.format(today.steps)}걸음</strong>
          </article>
          <article className="classroom-dashboard-kpi">
            <span>이번 주 합계</span>
            <strong>{numberFormatter.format(totalSteps)}걸음</strong>
          </article>
          <article className="classroom-dashboard-kpi">
            <span>하루 평균</span>
            <strong>{numberFormatter.format(averageSteps)}걸음</strong>
          </article>
          <article className="classroom-dashboard-kpi">
            <span>이동 거리</span>
            <strong>{distanceFormatter.format(totalDistance / 1000)}km</strong>
          </article>
        </section>

        <section className="classroom-dashboard-panel">
          <div className="classroom-dashboard-panel-head">
            <div>
              <span>Current KST week</span>
              <h2>이번 주 걸음 수</h2>
            </div>
            <span>
              {latestSync
                ? `마지막 동기화 ${new Date(latestSync).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}`
                : "아직 동기화되지 않음"}
            </span>
          </div>
          <p className="student-walking-week-range" aria-label="걷기 기록 기간">
            {formatWeekRange(weekRange.weekStart, weekRange.weekEnd)}
          </p>
          <div className="classroom-dashboard-list student-walking-days" role="list">
            {rows.map((row) => {
              const isFuture = row.day > weekRange.today;
              const displaySteps = isFuture ? 0 : row.steps;
              const percentage = Math.round((displaySteps / maxSteps) * 100);
              return (
                <div
                  key={row.day}
                  className="classroom-dashboard-row"
                  role="listitem"
                  aria-label={`${formatDay(row.day, today.day)}, ${numberFormatter.format(displaySteps)}걸음${
                    isFuture ? ", 아직 날짜가 오지 않았어요" : row.syncedAt ? "" : ", 미동기화"
                  }`}
                >
                  <span className={isFuture ? "student-walking-future-day" : undefined}>
                    {formatDay(row.day, today.day)}
                  </span>
                  <span style={{ flex: 1, marginInline: "1rem" }} aria-hidden="true">
                    <span
                      style={{
                        display: "block",
                        width: `${percentage}%`,
                        minWidth: displaySteps > 0 ? "4px" : 0,
                        height: "10px",
                        background: "var(--color-primary)",
                      }}
                    />
                  </span>
                  <strong>{isFuture ? "—" : `${numberFormatter.format(displaySteps)}걸음`}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <section className="classroom-dashboard-panel student-walking-rewards" aria-labelledby="walking-rewards-title">
          <div className="classroom-dashboard-panel-head">
            <div>
              <span>Weekly reward</span>
              <h2 id="walking-rewards-title">이번 주 보상 진행</h2>
            </div>
            <strong className="student-walking-reward-total">
              {reachedAmount}원 / {weeklyRewardTotal}원
            </strong>
          </div>
          <div className="student-walking-tier-grid" role="list" aria-label="주간 걷기 보상 단계">
            {weeklyTiers.map((tier, index) => {
              const achieved = totalSteps >= tier.steps;
              return (
                <div
                  key={tier.key}
                  className={`student-walking-tier${achieved ? " is-achieved" : ""}`}
                  role="listitem"
                  aria-label={`${numberFormatter.format(tier.steps)}걸음 ${
                    achieved ? "달성" : "미달성"
                  }, ${index === 0 ? `${tier.amount}원` : `추가 ${tier.amount}원`}`}
                >
                  <span>{numberFormatter.format(tier.steps)}걸음</span>
                  <strong>{index === 0 ? `${tier.amount}원` : `+${tier.amount}원`}</strong>
                </div>
              );
            })}
          </div>
          <p className="student-walking-reward-next">
            {nextTier
              ? `${numberFormatter.format(nextTier.steps)}걸음까지 ${numberFormatter.format(
                  Math.max(0, nextTier.steps - totalSteps),
                )}걸음 남았어요.`
              : "75,000걸음 보상을 모두 달성했어요."}
          </p>
        </section>

      </main>
    </>
  );
}
