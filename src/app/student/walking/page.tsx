import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentHomePayload } from "@/lib/student-home";
import {
  addWalkingDays,
  getStudentWalkingDays,
  getWalkingDayKey,
  type WalkingDay,
} from "@/lib/walking";
import { StudentTopNav } from "@/components/StudentTopNav";

const numberFormatter = new Intl.NumberFormat("ko-KR");
const distanceFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function fillDays(rows: WalkingDay[]) {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const today = getWalkingDayKey();
  return Array.from({ length: 7 }, (_, index) => {
    const key = addWalkingDays(today, -(6 - index));
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
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(year, month - 1, day));
}

export default async function StudentWalkingPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/walking");

  const [home, storedRows] = await Promise.all([
    getStudentHomePayload(student),
    getStudentWalkingDays(student.id, 7),
  ]);
  const rows = fillDays(storedRows);
  const today = rows[rows.length - 1];
  const totalSteps = rows.reduce((sum, row) => sum + row.steps, 0);
  const totalDistance = rows.reduce((sum, row) => sum + row.distanceMeters, 0);
  const averageSteps = Math.round(totalSteps / rows.length);
  const maxSteps = Math.max(1, ...rows.map((row) => row.steps));
  const latestSync = storedRows.reduce<string | null>((latest, row) => {
    if (!row.syncedAt) return latest;
    if (!latest) return row.syncedAt;
    return new Date(row.syncedAt) > new Date(latest) ? row.syncedAt : latest;
  }, null);

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={home.duties}
        showDevFeatures={isAdminEmail(student.classroom.teacher.email)}
      />
      <main className="student-page">
        <header className="home-header">
          <div>
            <p className="home-subtitle">Health Connect</p>
            <h1 className="home-title">걷기</h1>
            <p className="home-subtitle">
              Android 앱에서 동기화한 최근 7일 걸음 수와 이동 거리를 확인해요.
            </p>
          </div>
        </header>

        {!latestSync ? (
          <section className="classroom-dashboard-panel" aria-labelledby="walking-empty-title">
            <div className="classroom-dashboard-panel-head">
              <div>
                <span>Get started</span>
                <h2 id="walking-empty-title">아직 동기화된 걷기 기록이 없습니다</h2>
              </div>
            </div>
            <p className="classroom-dashboard-empty">
              Android 앱의 걷기 화면에서 Health Connect를 연결하고 동기화하면
              오늘과 최근 7일 기록이 여기에 표시됩니다.
            </p>
          </section>
        ) : null}

        <section className="classroom-dashboard-kpis" aria-label="걷기 요약">
          <article className="classroom-dashboard-kpi">
            <span>오늘</span>
            <strong>{numberFormatter.format(today.steps)}걸음</strong>
          </article>
          <article className="classroom-dashboard-kpi">
            <span>최근 7일</span>
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
              <span>Recent 7 days</span>
              <h2>날짜별 걸음 수</h2>
            </div>
            <span>
              {latestSync
                ? `마지막 동기화 ${new Date(latestSync).toLocaleString("ko-KR")}`
                : "아직 동기화되지 않음"}
            </span>
          </div>
          <div className="classroom-dashboard-list">
            {rows.map((row) => {
              const percentage = Math.round((row.steps / maxSteps) * 100);
              return (
                <div
                  key={row.day}
                  className="classroom-dashboard-row"
                  aria-label={`${formatDay(row.day, today.day)}, ${numberFormatter.format(row.steps)}걸음`}
                >
                  <span>{formatDay(row.day, today.day)}</span>
                  <span style={{ flex: 1, marginInline: "1rem" }} aria-hidden="true">
                    <span
                      style={{
                        display: "block",
                        width: `${percentage}%`,
                        minWidth: row.steps > 0 ? "4px" : 0,
                        height: "10px",
                        background: "var(--color-primary)",
                      }}
                    />
                  </span>
                  <strong>{numberFormatter.format(row.steps)}걸음</strong>
                </div>
              );
            })}
          </div>
        </section>

        <section className="classroom-dashboard-panel">
          <div className="classroom-dashboard-panel-head">
            <div>
              <span>Privacy</span>
              <h2>저장되는 정보</h2>
            </div>
          </div>
          <p className="classroom-dashboard-empty">
            날짜별 걸음 수와 이동 거리 합계만 저장합니다. GPS 위치, 이동 경로,
            원본 센서 샘플은 저장하지 않습니다.
          </p>
        </section>
      </main>
    </>
  );
}
