import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { StudentTopNav } from "@/components/StudentTopNav";
import { CharacterShopClient } from "./CharacterShopClient";

export const dynamic = "force-dynamic";

export default async function CharacterShopPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/character-shop");
  const duties = await getStudentDuties(student.id);

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={duties}
      />
      <CharacterShopClient />
    </>
  );
}
