import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { StudentTopNav } from "@/components/StudentTopNav";
import { CharacterRoomClient } from "./CharacterRoomClient";

export const dynamic = "force-dynamic";

export default async function CharacterRoomPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/character-room");
  const duties = await getStudentDuties(student.id);

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={duties}
      />
      <CharacterRoomClient />
    </>
  );
}
