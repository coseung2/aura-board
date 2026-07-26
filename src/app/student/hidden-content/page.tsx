import { redirect } from "next/navigation";
import { StudentTopNav } from "@/components/StudentTopNav";
import { HiddenContentManager } from "@/components/student/HiddenContentManager";
import { db } from "@/lib/db";
import { getStudentDuties } from "@/lib/role-portals";
import { getCurrentStudent } from "@/lib/student-auth";

export default async function StudentHiddenContentPage() {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) redirect("/login?from=/student/hidden-content");

  const [classroom, duties] = await Promise.all([
    db.classroom.findUnique({
      where: { id: student.classroomId },
      select: { name: true },
    }),
    getStudentDuties(student.id),
  ]);
  if (!classroom) redirect("/login?from=/student/hidden-content");

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={classroom.name}
        duties={duties}
      />
      <main className="student-page student-hidden-page">
        <header className="student-activity-header">
          <div className="student-activity-heading">
            <p className="student-activity-eyebrow">내 콘텐츠 설정</p>
            <h1 className="student-activity-title">숨긴 콘텐츠</h1>
          </div>
        </header>
        <HiddenContentManager />
      </main>
    </>
  );
}
