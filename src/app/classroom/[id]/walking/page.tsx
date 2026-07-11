import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getClassroomWalkingSummary } from "@/lib/walking";

const numberFormatter = new Intl.NumberFormat("ko-KR");
const distanceFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ClassroomWalkingPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser().catch(() => null);
  if (!user) notFound();
  const classroom = await db.classroom.findUnique({
    where: { id },
    select: { id: true, name: true, teacherId: true },
  });

  if (!classroom || classroom.teacherId !== user.id) notFound();

  const students = await getClassroomWalkingSummary(id);
  const connectedStudents = students.filter((student) => student.lastSyncedAt);
  const todaySteps = students.reduce((sum, student) => sum + student.todaySteps, 0);
  const sevenDaySteps = students.reduce((sum, student) => sum + student.sevenDaySteps, 0);
  const sevenDayDistance = students.reduce(
    (sum, student) => sum + student.sevenDayDistanceMeters,
    0,
  );
  const maxSteps = Math.max(1, ...students.map((student) => student.sevenDaySteps));

  return (
    <main className="classroom-page classroom-page-detail">
      <a href={`/classroom/${id}/dashboard`} className="classroom-back-link">
        &larr; 학급 대시보드
      </a>
      <h1 className="classroom-page-title">{classroom.name} 걷기</h1>
      <p className="home-subtitle">
        학생이 Android 앱에서 Health Connect와 동기화한 최근 7일 합계입니다.
      </p>

      <section className="classroom-dashboard-kpis" aria-label="학급 걷기 요약">
        <article className="classroom-dashboard-kpi">
          <span>연결 학생</span>
          <strong>{connectedStudents.length}/{students.length}명</strong>
        </article>
        <article className="classroom-dashboard-kpi">
          <span>오늘 걸음</span>
          <strong>{numberFormatter.format(todaySteps)}걸음</strong>
        </article>
        <article className="classroom-dashboard-kpi">
          <span>최근 7일</span>
          <strong>{numberFormatter.format(sevenDaySteps)}걸음</strong>
        </article>
        <article className="classroom-dashboard-kpi">
          <span>이동 거리</span>
          <strong>{distanceFormatter.format(sevenDayDistance / 1000)}km</strong>
        </article>
      </section>

      <section className="classroom-dashboard-panel">
        <div className="classroom-dashboard-panel-head">
          <div>
            <span>Students</span>
            <h2>학생별 최근 7일</h2>
          </div>
        </div>
        <div className="classroom-dashboard-list">
          {students.map((student) => {
            const percentage = Math.round((student.sevenDaySteps / maxSteps) * 100);
            return (
              <div
                key={student.studentId}
                className="classroom-dashboard-row walking-student-row"
                aria-label={`${student.studentNumber ?? "번호 없음"}번 ${student.studentName}, 오늘 ${numberFormatter.format(student.todaySteps)}걸음, 최근 7일 ${numberFormatter.format(student.sevenDaySteps)}걸음${student.lastSyncedAt ? "" : ", 아직 동기화되지 않음"}`}
              >
                <span className="walking-student-name">
                  <strong>{student.studentNumber ?? "-"}번 {student.studentName}</strong>
                  <small>
                    {student.lastSyncedAt
                      ? `마지막 동기화 ${new Date(student.lastSyncedAt).toLocaleString("ko-KR")}`
                      : "아직 동기화되지 않음"}
                  </small>
                </span>
                <span className="walking-bar" aria-hidden="true">
                  <span
                    className="walking-bar-fill"
                    style={{
                      width: `${percentage}%`,
                      minWidth: student.sevenDaySteps > 0 ? "4px" : 0,
                    }}
                  />
                </span>
                <span className="walking-metric">
                  <small>오늘</small>
                  <strong>{numberFormatter.format(student.todaySteps)}걸음</strong>
                </span>
                <span className="walking-metric">
                  <small>최근 7일</small>
                  <strong>{numberFormatter.format(student.sevenDaySteps)}걸음</strong>
                </span>
              </div>
            );
          })}
          {students.length === 0 ? (
            <p className="classroom-dashboard-empty">등록된 학생이 없습니다.</p>
          ) : null}
        </div>
      </section>

      <section className="classroom-dashboard-panel">
        <div className="classroom-dashboard-panel-head">
          <div>
            <span>Privacy</span>
            <h2>건강 데이터 처리 범위</h2>
          </div>
        </div>
        <p className="classroom-dashboard-empty">
          교사 화면에는 날짜별 걸음 수와 이동 거리 합계만 표시합니다. GPS 위치,
          이동 경로, 원본 센서 샘플은 수집하거나 저장하지 않습니다.
        </p>
      </section>
    </main>
  );
}
