import { redirect } from "next/navigation";
import { StudentTopNav } from "@/components/StudentTopNav";
import { PetSanctuary } from "@/components/pets/PetSanctuary";
import { getStudentDuties } from "@/lib/role-portals";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";

export default async function StudentPetsPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/pets");
  const duties = await getStudentDuties(student.id);

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={duties}
      />
      <PetSanctuary />
    </>
  );
}
