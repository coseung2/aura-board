import { redirect } from "next/navigation";

import { getStudentDuties } from "@/lib/role-portals";
import { getCurrentStudent } from "@/lib/student-auth";
import { StudentTopNav } from "@/components/StudentTopNav";
import { CreatureHub } from "@/components/creatures/CreatureHub";

export const dynamic = "force-dynamic";

export default async function StudentAuraPetPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/aura-pet");

  const duties = await getStudentDuties(student.id);

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={duties}
      />
      <CreatureHub />
    </>
  );
}
