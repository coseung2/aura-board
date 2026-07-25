import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { StudentTopNav } from "@/components/StudentTopNav";
import { getStudentMonthlyAttendance } from "@/lib/student-attendance";
import { StudentActivityTabs } from "@/components/student/StudentActivityTabs";
import { AttendanceMission } from "@/components/student/AttendanceMission";
import { ReadingForm } from "./ReadingForm";

export const dynamic = "force-dynamic";

// 학생 독서 기록 페이지. 학생 본인 화면 상단 내비게이션의 독서 탭에서 진입.
export default async function StudentReadingPage() {
  const student = await getCurrentStudent();
  if (!student) {
    redirect("/login?from=/student/reading");
  }
  const [classroom, duties, attendance] = await Promise.all([
    db.classroom.findUnique({
      where: { id: student.classroomId },
      select: { id: true, name: true },
    }),
    getStudentDuties(student.id),
    getStudentMonthlyAttendance(student.id),
  ]);
  if (!classroom) {
    redirect("/login?from=/student/reading");
  }
  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={classroom.name}
        duties={duties}
      />
      <main className="student-page student-reading-page">
        <StudentActivityTabs
          activity="reading"
          records={<ReadingForm />}
          missions={
            <div className="student-reading-missions-content">
              <AttendanceMission studentId={student.id} attendance={attendance} />
              <section className="classroom-dashboard-panel student-reading-future-missions" aria-labelledby="reading-missions-title">
                <div className="classroom-dashboard-panel-head">
                  <div>
                    <h2 id="reading-missions-title">독서 미션</h2>
                    <p>곧 새로운 미션을 만날 수 있어요.</p>
                  </div>
                </div>
                <ul className="student-reading-future-mission-list">
                  <li>주간 독서 권수</li>
                  <li>연속 독서일</li>
                  <li>감상문 작성량</li>
                  <li>장르 탐험</li>
                </ul>
              </section>
            </div>
          }
        />
      </main>
    </>
  );
}
