import { notFound, redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { StudentTopNav } from "@/components/StudentTopNav";
import { PetGame } from "@/components/pets/PetGame";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export default async function StudentPetsPage() {
  if (!isFeatureEnabled("petGame")) notFound();

  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/pets");

  const duties = await getStudentDuties(student.id);

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={duties}
        showDevFeatures={isAdminEmail(student.classroom.teacher.email)}
      />
      <PetGame />
    </>
  );
}
