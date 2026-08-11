import { redirect } from "next/navigation";
import { StudentBoardHub } from "@/app/student/_components/StudentBoardHub";
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
        <h1 className="sr-only">보드</h1>
        <StudentBoardHub boards={home.boards} />
      </main>
    </>
  );
}
