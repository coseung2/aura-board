import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { StudentTopNav } from "@/components/StudentTopNav";
import { StudentActivityHeader } from "@/components/student/StudentActivityHeader";
import { ReadingForm } from "./ReadingForm";

export const dynamic = "force-dynamic";

// 학생 독서 기록 페이지. 학생 본인 화면 상단 내비게이션의 독서 탭에서 진입.
export default async function StudentReadingPage() {
  const student = await getCurrentStudent();
  if (!student) {
    redirect("/login?from=/student/reading");
  }
  const [classroom, duties] = await Promise.all([
    db.classroom.findUnique({
      where: { id: student.classroomId },
      select: { id: true, name: true },
    }),
    getStudentDuties(student.id),
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
        <StudentActivityHeader active="reading" />
        <ReadingForm />
      </main>
    </>
  );
}
