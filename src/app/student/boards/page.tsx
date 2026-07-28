import { redirect } from "next/navigation";
import { StudentBoardHub } from "@/components/StudentDashboard";
import { StudentTopNav } from "@/components/StudentTopNav";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentHomePayload } from "@/lib/student-home";

export default async function StudentBoardsPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/boards");

  const home = await getStudentHomePayload(student);
  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={home.duties}
      />
      <main className="student-page student-boards-page">
        <header className="student-page-header">
          <p className="student-page-eyebrow">{student.classroom.name}</p>
          <h1 className="student-page-title">보드</h1>
        </header>
        <StudentBoardHub boards={home.boards} />
      </main>
    </>
  );
}
