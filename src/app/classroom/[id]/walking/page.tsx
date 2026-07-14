import { notFound } from "next/navigation";
import Link from "next/link";
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
  const notConnectedStudents = students.length - connectedStudents.length;

  return (
    <main className="classroom-page classroom-page-detail classroom-feature-page">
      <header className="classroom-feature-header">
        <div>
          <Link href={`/classroom/${id}/dashboard`} className="classroom-back-link">
            &larr; 학급 대시보드
          </Link>
          <p className="classroom-feature-eyebrow">{classroom.name}</p>
          <h1 className="classroom-page-title">걷기 현황</h1>
          <p className="classroom-feature-description">
            학생 앱에서 동기화한 오늘 기록과 최근 7일 활동량을 확인합니다.
          </p>
        </div>
        <nav className="classroom-feature-switcher" aria-label="학급 활동 관리">
          <Link href={`/classroom/${id}/walking`} aria-current="page">
            걷기 현황
          </Link>
          <Link href={`/classroom/${id}/daily-banners`}>배너 관리</Link>
        </nav>
      </header>

      <section className="classroom-feature-metrics" aria-label="학급 걷기 요약">
        <div>
          <span>연결 학생</span>
          <strong>{connectedStudents.length}/{students.length}명</strong>
          <small>{notConnectedStudents > 0 ? `${notConnectedStudents}명 연결 필요` : "모두 연결됨"}</small>
        </div>
        <div>
          <span>오늘 걸음</span>
          <strong>{numberFormatter.format(todaySteps)}걸음</strong>
          <small>학급 합계</small>
        </div>
        <div>
          <span>최근 7일</span>
          <strong>{numberFormatter.format(sevenDaySteps)}걸음</strong>
          <small>학급 합계</small>
        </div>
        <div>
          <span>이동 거리</span>
          <strong>{distanceFormatter.format(sevenDayDistance / 1000)}km</strong>
          <small>최근 7일</small>
        </div>
      </section>

      <section className="classroom-feature-section">
        <div className="classroom-feature-section-head">
          <div>
            <h2>학생별 활동</h2>
            <p>최근 7일 걸음이 많은 학생을 기준으로 막대 길이를 비교합니다.</p>
          </div>
          <span>{students.length}명</span>
        </div>
        <div className="walking-roster" role="table" aria-label="학생별 걷기 현황">
          <div className="walking-roster-head" role="row">
            <span role="columnheader">학생</span>
            <span role="columnheader">활동 비교</span>
            <span role="columnheader">오늘</span>
            <span role="columnheader">최근 7일</span>
          </div>
          {students.map((student) => {
            const percentage = Math.round((student.sevenDaySteps / maxSteps) * 100);
            return (
              <div
                key={student.studentId}
                className="walking-student-row"
                role="row"
                aria-label={`${student.studentNumber ?? "번호 없음"}번 ${student.studentName}, 오늘 ${numberFormatter.format(student.todaySteps)}걸음, 최근 7일 ${numberFormatter.format(student.sevenDaySteps)}걸음${student.lastSyncedAt ? "" : ", 아직 동기화되지 않음"}`}
              >
                <span className="walking-student-name" role="cell">
                  <strong>{student.studentNumber ?? "-"}번 {student.studentName}</strong>
                  <small>
                    {student.lastSyncedAt
                      ? `마지막 동기화 ${new Date(student.lastSyncedAt).toLocaleString("ko-KR")}`
                      : "아직 동기화되지 않음"}
                  </small>
                </span>
                <span className="walking-bar" role="cell" aria-hidden="true">
                  <span
                    className="walking-bar-fill"
                    style={{
                      width: `${percentage}%`,
                      minWidth: student.sevenDaySteps > 0 ? "4px" : 0,
                    }}
                  />
                </span>
                <span className="walking-metric" role="cell">
                  <small>오늘</small>
                  <strong>{numberFormatter.format(student.todaySteps)}걸음</strong>
                </span>
                <span className="walking-metric" role="cell">
                  <small>최근 7일</small>
                  <strong>{numberFormatter.format(student.sevenDaySteps)}걸음</strong>
                </span>
              </div>
            );
          })}
          {students.length === 0 ? (
            <p className="classroom-feature-empty">등록된 학생이 없습니다.</p>
          ) : null}
        </div>
      </section>

      <details className="classroom-feature-disclosure">
        <summary>건강 데이터 처리 범위</summary>
        <p>
          교사 화면에는 날짜별 걸음 수와 이동 거리 합계만 표시합니다. GPS 위치,
          이동 경로, 원본 센서 샘플은 수집하거나 저장하지 않습니다.
        </p>
      </details>
    </main>
  );
}
