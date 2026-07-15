import { notFound, redirect } from "next/navigation";
import { ClassroomFeatureHeader } from "@/components/classroom/ClassroomFeatureHeader";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getClassroomWalkingSummary } from "@/lib/walking";
import { ActivitySparkline } from "@/components/classroom/ActivitySparkline";
import { WalkingStudentDeleteAction } from "@/components/classroom/WalkingStudentDeleteAction";

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
  if (!user) {
    redirect(`/login?from=${encodeURIComponent(`/classroom/${id}/walking`)}`);
  }
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
  const notConnectedStudents = students.length - connectedStudents.length;

  return (
    <main className="classroom-page classroom-page-detail classroom-feature-page">
      <ClassroomFeatureHeader
        classroomId={id}
        eyebrow={classroom.name}
        description="학생 앱에서 동기화한 오늘 기록과 최근 7일 활동량을 확인합니다."
        active="walking"
      />

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
            <p>최근 7일의 날짜별 걸음 추이를 비교합니다.</p>
          </div>
          <span>{students.length}명</span>
        </div>
        <div className="walking-roster" role="table" aria-label="학생별 걷기 현황">
          <div className="walking-roster-head" role="row">
            <span role="columnheader">학생</span>
            <span role="columnheader">활동 비교</span>
            <span role="columnheader">오늘</span>
            <span role="columnheader">최근 7일</span>
            <span role="columnheader">관리</span>
          </div>
          {students.map((student) => (
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
                <span className="walking-activity-cell" role="cell">
                  <ActivitySparkline
                    values={student.recentDailySteps}
                    label={`${student.studentName} 최근 7일 걸음 추이`}
                    tone="success"
                  />
                </span>
                <span className="walking-metric" role="cell">
                  <strong>{numberFormatter.format(student.todaySteps)}걸음</strong>
                </span>
                <span className="walking-metric" role="cell">
                  <strong>{numberFormatter.format(student.sevenDaySteps)}걸음</strong>
                </span>
                <WalkingStudentDeleteAction
                  classroomId={id}
                  studentId={student.studentId}
                  studentName={student.studentName}
                />
              </div>
          ))}
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
