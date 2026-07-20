import { TopNav } from "@/components/TopNav";
import { StudentTopNav } from "@/components/StudentTopNav";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { isAdminEmail } from "@/lib/admin";

export default async function ClassroomDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser().catch(() => null);
  const student = user ? null : await getCurrentStudent();
  const duties = student ? await getStudentDuties(student.id) : [];

  return (
    <>
      {user ? (
        <TopNav showAdmin={isAdminEmail(user.email)} />
      ) : student ? (
        <StudentTopNav
          studentName={student.name}
          classroomName={student.classroom.name}
          duties={duties}
        />
      ) : null}
      {children}
    </>
  );
}
