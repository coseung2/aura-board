import { redirect } from "next/navigation";

import { getStudentDuties } from "@/lib/role-portals";
import { getCurrentStudent } from "@/lib/student-auth";
import { StudentTopNav } from "@/components/StudentTopNav";
import { isAdminEmail } from "@/lib/admin";
import { SlimePetPage } from "@/components/creatures/SlimePetPage";
import { ClassroomSlimeGallery } from "./classroom/ClassroomSlimeGallery";

export const dynamic = "force-dynamic";

export default async function StudentAuraPetPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/aura-pet");

  const [duties, params] = await Promise.all([
    getStudentDuties(student.id),
    searchParams,
  ]);
  const section =
    params.section === "classroom"
      ? "classroom"
      : params.section === "shop"
        ? "shop"
        : "mine";

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={duties}
        isAdminClassroom={isAdminEmail(student.classroom.teacher.email)}
      />
      {section === "classroom" ? (
        <ClassroomSlimeGallery classroomId={student.classroomId} />
      ) : (
        <SlimePetPage initialSection={section} />
      )}
    </>
  );
}
