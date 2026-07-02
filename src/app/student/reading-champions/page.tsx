import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { StudentTopNav } from "@/components/StudentTopNav";
import { CharacterTownClient } from "../character-town/CharacterTownClient";

export const dynamic = "force-dynamic";

export default async function ReadingChampionsPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/reading-champions");
  const duties = await getStudentDuties(student.id);

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={duties}
      />
      <CharacterTownClient />
    </>
  );
}
