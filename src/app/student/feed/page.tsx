import { redirect } from "next/navigation";
import { StudentFeedClient } from "@/components/feed/StudentFeedClient";
import { StudentTopNav } from "@/components/StudentTopNav";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentHomePayload } from "@/lib/student-home";
import { isAdminEmail } from "@/lib/admin";

export const metadata = {
  title: "피드 · Aura-board",
};

export default async function StudentFeedPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/feed");
  const isAdminClassroom = isAdminEmail(student.classroom.teacher.email);
  if (!isAdminClassroom) redirect("/student");

  const home = await getStudentHomePayload(student);
  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={home.duties}
        isAdminClassroom={isAdminClassroom}
      />
      <main className="student-page ab-feed-page">
        <StudentFeedClient />
      </main>
    </>
  );
}
