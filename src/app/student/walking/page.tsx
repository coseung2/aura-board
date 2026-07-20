import { redirect } from "next/navigation";
import Image from "next/image";
import { Prisma } from "@prisma/client";
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
import {
  getWalkingWeeklyRewardTiers,
  WALKING_MONTHLY_ATTENDANCE_ORDINALS,
} from "@/lib/reward-policy";
import { StudentTopNav } from "@/components/StudentTopNav";
import { StudentWalkingTabs } from "@/components/student/StudentWalkingTabs";
import { WalkingAttendanceCalendar } from "@/components/student/WalkingAttendanceCalendar";
import {
  WeeklyWalkingMission,
  type WeeklyWalkingRewards,
} from "@/components/student/WeeklyWalkingMission";

const numberFormatter = new Intl.NumberFormat("ko-KR");
const distanceFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

type ClassroomWalkingRank = {
  studentId: string;
  studentNumber: number | null;
  studentName: string;
  weeklySteps: number | bigint;
};

type WalkingAchievementSummary = {
  maxDailySteps: number | bigint;
  maxWeeklySteps: number | bigint;
  maxMonthlySteps: number | bigint;
};

const WALKING_ACHIEVEMENTS = [
  {
    key: "daily-20k",
    label: "오늘의 질주",
    condition: "하루 20,000보",
    image: "/walking/titles/daily-20k-pixel-512.png",
    required: 20_000,
    value: (summary: WalkingAchievementSummary) => Number(summary.maxDailySteps),
  },
  {
    key: "weekly-50k",
    label: "꾸준한 발걸음",
    condition: "주간 50,000보",
    image: "/walking/titles/weekly-50k-pixel-512.png",
    required: 50_000,
    value: (summary: WalkingAchievementSummary) => Number(summary.maxWeeklySteps),
  },
  {
    key: "weekly-75k",
    label: "위대한 행진",
    condition: "주간 75,000보",
    image: "/walking/titles/weekly-75k-pixel-512.png",
    required: 75_000,
    value: (summary: WalkingAchievementSummary) => Number(summary.maxWeeklySteps),
  },
  {
    key: "monthly-300k",
    label: "국토대장정",
    condition: "월간 300,000보",
    image: "/walking/titles/monthly-300k-pixel-512.png",
    required: 300_000,
    value: (summary: WalkingAchievementSummary) => Number(summary.maxMonthlySteps),
  },
] as const;

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

  const weekRange = getCurrentWeekRange();
  const [
    home,
    storedRows,
    rewardPolicy,
    classroomTopFive,
    achievementRows,
  ] = await Promise.all([
    getStudentHomePayload(student),
    getStudentWalkingDays(student.id, 31),
    db.$transaction((tx) => loadRewardPolicy(tx, student.classroomId)),
    db.$queryRaw<ClassroomWalkingRank[]>(Prisma.sql`
      SELECT
        student."id" AS "studentId",
        student."number" AS "studentNumber",
        student."name" AS "studentName",
        COALESCE(SUM(walking."steps"), 0)::bigint AS "weeklySteps"
      FROM "Student" student
      LEFT JOIN "StudentWalkingDailyStat" walking
        ON walking."studentId" = student."id"
        AND walking."day" >= ${weekRange.weekStart}::date
        AND walking."day" <= ${weekRange.today}::date
      WHERE student."classroomId" = ${student.classroomId}
      GROUP BY student."id", student."number", student."name"
      ORDER BY "weeklySteps" DESC, student."number" ASC NULLS LAST, student."name" ASC
      LIMIT 5
    `),
    db.$queryRaw<WalkingAchievementSummary[]>(Prisma.sql`
      WITH weekly AS (
        SELECT MAX("weeklySteps")::bigint AS "maxWeeklySteps"
        FROM (
          SELECT SUM("steps")::bigint AS "weeklySteps"
          FROM "StudentWalkingDailyStat"
          WHERE "studentId" = ${student.id}
          GROUP BY DATE_TRUNC('week', "day")
        ) totals
      ), monthly AS (
        SELECT MAX("monthlySteps")::bigint AS "maxMonthlySteps"
        FROM (
          SELECT SUM("steps")::bigint AS "monthlySteps"
          FROM "StudentWalkingDailyStat"
          WHERE "studentId" = ${student.id}
          GROUP BY DATE_TRUNC('month', "day")
        ) totals
      )
      SELECT
        COALESCE((
          SELECT MAX("steps")::bigint
          FROM "StudentWalkingDailyStat"
          WHERE "studentId" = ${student.id}
        ), 0)::bigint AS "maxDailySteps",
        COALESCE(weekly."maxWeeklySteps", 0)::bigint AS "maxWeeklySteps",
        COALESCE(monthly."maxMonthlySteps", 0)::bigint AS "maxMonthlySteps"
      FROM weekly CROSS JOIN monthly
    `),
  ]);
  const weeklyTiers = getWalkingWeeklyRewardTiers(rewardPolicy);
  const achievementSummary = achievementRows[0] ?? {
    maxDailySteps: 0,
    maxWeeklySteps: 0,
    maxMonthlySteps: 0,
  };
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
  const initialWeeklyRewards: WeeklyWalkingRewards = {
    weekStart: weekRange.weekStart,
    totalSteps,
    maxSteps: Math.max(1, totalSteps, ...weeklyTiers.map((tier) => tier.steps)),
    tiers: weeklyTiers.map((tier) => ({
      key: tier.key,
      steps: tier.steps,
      amount: tier.amount,
      achieved: totalSteps >= tier.steps,
      claimed: false,
    })),
  };
  const dailyStepThreshold = Math.max(
    1,
    Math.floor(Number(rewardPolicy.walkingRewardStepThreshold) || 1),
  );
  const dailyUnitCap = Math.max(
    1,
    Math.min(4, Math.floor(Number(rewardPolicy.walkingDailyUnitCap) || 1)),
  );
  const dailyMaxSteps = dailyStepThreshold * dailyUnitCap;
  const dailyRewardAmount = Math.max(
    0,
    Math.floor(Number(rewardPolicy.walkingRewardAmount) || 0),
  );
  const dailyMissionProgress = Math.min(
    100,
    Math.round((today.steps / dailyMaxSteps) * 100),
  );
  const dailyMilestones = Array.from({ length: dailyUnitCap }, (_, index) => ({
    steps: dailyStepThreshold * (index + 1),
    amount: dailyRewardAmount,
  }));
  const [monthYear, monthNumber] = weekRange.today.split("-").map(Number);
  const currentMonth = `${monthYear}-${String(monthNumber).padStart(2, "0")}`;
  const monthDays = WALKING_MONTHLY_ATTENDANCE_ORDINALS;
  const attendanceCount = new Set(
    storedRows
      .filter(
        (row) =>
          row.day.startsWith(`${currentMonth}-`) &&
          row.day <= weekRange.today &&
          Boolean(row.syncedAt),
      )
      .map((row) => row.day),
  ).size;

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={home.duties}
      />
      <main className="student-page student-walking-page">
        <StudentWalkingTabs
          records={
            <>
              {!hasSyncedData ? (
                <section
                  className="classroom-dashboard-panel"
                  aria-labelledby="walking-empty-title"
                >
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

              <section className="classroom-dashboard-panel student-walking-week-chart">
                <div className="classroom-dashboard-panel-head">
                  <div>
                    <span>주간기록</span>
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
                <div className="student-walking-days" role="list">
                  {rows.map((row) => {
                    const isFuture = row.day > weekRange.today;
                    const displaySteps = isFuture ? 0 : row.steps;
                    const percentage = Math.round((displaySteps / maxSteps) * 100);
                    return (
                      <div
                        key={row.day}
                        className="student-walking-day-row"
                        role="listitem"
                        aria-label={`${formatDay(row.day, today.day)}, ${numberFormatter.format(displaySteps)}걸음${
                          isFuture
                            ? ", 아직 날짜가 오지 않았어요"
                            : row.syncedAt
                              ? ""
                              : ", 미동기화"
                        }`}
                      >
                        <span
                          className={`student-walking-day-label${
                            isFuture ? " student-walking-future-day" : ""
                          }`}
                        >
                          {formatDay(row.day, today.day)}
                        </span>
                        <span className="student-walking-bar-track" aria-hidden="true">
                          <span
                            className="student-walking-bar-fill"
                            style={{
                              width: `${percentage}%`,
                              minWidth: displaySteps > 0 ? "4px" : 0,
                            }}
                          />
                        </span>
                        <strong className="student-walking-step-label">
                          {isFuture ? "—" : `${numberFormatter.format(displaySteps)}걸음`}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section
                className="classroom-dashboard-panel student-walking-leaderboard"
                aria-labelledby="walking-classroom-top-five-title"
              >
                <div className="classroom-dashboard-panel-head">
                  <h2 id="walking-classroom-top-five-title">우리 반 Top 5</h2>
                  <span>이번 주</span>
                </div>
                <ol className="student-walking-leaderboard-list">
                  {classroomTopFive.map((rankedStudent, index) => (
                    <li
                      key={rankedStudent.studentId}
                      className={
                        rankedStudent.studentId === student.id ? "is-current" : undefined
                      }
                    >
                      <strong className="student-walking-leaderboard-rank">
                        {index + 1}
                      </strong>
                      <span className="student-walking-leaderboard-name">
                        {rankedStudent.studentNumber !== null
                          ? `${rankedStudent.studentNumber}번 ${rankedStudent.studentName}`
                          : rankedStudent.studentName}
                      </span>
                      <strong className="student-walking-leaderboard-steps">
                        {numberFormatter.format(Number(rankedStudent.weeklySteps))}걸음
                      </strong>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          }
          missions={
            <div className="student-walking-missions-content">
              <div className="student-walking-mission-dashboard">
                <section
                  className="classroom-dashboard-panel student-walking-attendance-panel"
                  aria-label="월간 출석 보드"
                >
                    <div className="classroom-dashboard-panel-head">
                    <h2 id="walking-attendance-title">출석미션</h2>
                    <strong
                      className={`student-walking-mission-status${
                        attendanceCount >= monthDays ? " is-complete" : ""
                      }`}
                    >
                      {attendanceCount} / {monthDays}일
                    </strong>
                  </div>
                  <WalkingAttendanceCalendar
                    studentId={student.id}
                    month={currentMonth}
                    monthDays={monthDays}
                    attendanceCount={attendanceCount}
                  />
                </section>

                <div className="student-walking-mission-summary">
                  <section
                    className="classroom-dashboard-panel student-walking-mission-section"
                    aria-labelledby="walking-daily-mission-title"
                  >
                    <div className="classroom-dashboard-panel-head">
                      <h2 id="walking-daily-mission-title">일간미션</h2>
                      <strong
                        className={`student-walking-mission-status${
                          today.steps >= dailyMaxSteps ? " is-complete" : ""
                        }`}
                      >
                        {today.steps >= dailyMaxSteps ? "달성" : "진행 중"}
                      </strong>
                    </div>
                    <div
                      className="student-walking-mission-progress"
                      aria-label={`오늘 ${numberFormatter.format(
                        today.steps,
                      )}걸음, 목표 ${numberFormatter.format(dailyMaxSteps)}걸음`}
                    >
                      <div className="student-walking-mission-progress-labels">
                        <span>
                          {numberFormatter.format(today.steps)} / {numberFormatter.format(dailyMaxSteps)}걸음
                        </span>
                        <strong>{dailyMissionProgress}%</strong>
                      </div>
                      <div className="student-walking-progress-track" aria-hidden="true">
                        <span style={{ width: `${dailyMissionProgress}%` }} />
                      </div>
                      <ol className="student-walking-daily-milestones" aria-label="일간 걸음 보상 단계">
                        {dailyMilestones.map((milestone) => (
                          <li
                            key={milestone.steps}
                            style={{ left: `${(milestone.steps / dailyMaxSteps) * 100}%` }}
                          >
                            <span className="student-walking-daily-milestone-dot" aria-hidden="true" />
                            <span>{numberFormatter.format(milestone.steps)}걸음</span>
                            <strong>{numberFormatter.format(milestone.amount)}원</strong>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </section>

                  <WeeklyWalkingMission initialRewards={initialWeeklyRewards} />
                </div>
              </div>

              <section
                className="classroom-dashboard-panel student-walking-achievements"
                aria-labelledby="walking-achievements-title"
              >
                <div className="classroom-dashboard-panel-head">
                  <h2 id="walking-achievements-title">걷기 칭호</h2>
                  <span>
                    {
                      WALKING_ACHIEVEMENTS.filter(
                        (achievement) =>
                          achievement.value(achievementSummary) >= achievement.required,
                      ).length
                    }
                    /{WALKING_ACHIEVEMENTS.length} 획득
                  </span>
                </div>
                <div className="student-walking-achievement-grid">
                  {WALKING_ACHIEVEMENTS.map((achievement) => {
                    const currentValue = achievement.value(achievementSummary);
                    const earned = currentValue >= achievement.required;
                    return (
                      <article
                        key={achievement.key}
                        className={`student-walking-achievement${earned ? " is-earned" : ""}`}
                      >
                        <div className="student-walking-achievement-image">
                          <Image
                            src={achievement.image}
                            alt={`${achievement.label} 칭호`}
                            fill
                            sizes="(max-width: 760px) 50vw, 280px"
                          />
                        </div>
                        <div className="student-walking-achievement-meta">
                          <strong>{achievement.condition}</strong>
                          <span>{earned ? "획득" : "미획득"}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
          }
        />

      </main>
    </>
  );
}
