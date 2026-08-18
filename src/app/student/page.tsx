import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentHomePayload } from "@/lib/student-home";
import { StudentDashboard } from "@/components/StudentDashboard";
import { StudentTopNav } from "@/components/StudentTopNav";
import { isAdminEmail } from "@/lib/admin";
import {
  legacyStudentBoardRedirect,
  type StudentBoardSearchParams,
} from "@/components/student/student-board-navigation";

type StudentPageProps = {
  searchParams: Promise<StudentBoardSearchParams>;
};

export default async function StudentPage({ searchParams }: StudentPageProps) {
  const legacyRedirect = legacyStudentBoardRedirect(await searchParams);
  if (legacyRedirect) redirect(legacyRedirect);

  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student");

  const home = await getStudentHomePayload(student);
  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={home.duties}
        isAdminClassroom={isAdminEmail(student.classroom.teacher.email)}
      />
      <main className="student-page">
        <StudentDashboard
          classroomId={student.classroomId}
          assignments={home.assignments}
          dailyRewards={home.dailyRewards}
        />
      </main>
    </>
  );
}
