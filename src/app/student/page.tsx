import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentHomePayload } from "@/lib/student-home";
import { StudentDashboard } from "@/components/StudentDashboard";
import { StudentTopNav } from "@/components/StudentTopNav";

export default async function StudentPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student");

  const home = await getStudentHomePayload(student);
  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={home.duties}
      />
      <main className="student-page">
        <StudentDashboard
          studentName={student.name}
          classroomName={student.classroom.name}
          classroomId={student.classroomId}
          boards={home.boards}
          duties={home.duties}
          assignments={home.assignments}
        />
      </main>
    </>
  );
}
