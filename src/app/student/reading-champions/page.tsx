import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { StudentTopNav } from "@/components/StudentTopNav";
import { StudentFeatureComingSoon } from "@/components/student/StudentFeatureComingSoon";

export const dynamic = "force-dynamic";

export default async function ReadingChampionsPage() {
  // 독서왕 전시공간은 admin teacher만 미리 볼 수 있다.
  const teacher = await getCurrentUser();
  if (!isAdminEmail(teacher?.email)) redirect("/student");

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
      <StudentFeatureComingSoon
        title="독서왕 전시공간"
        description="독서왕 전시공간은 아직 개발 중이에요. 독서 기록과 캐릭터 보상이 자연스럽게 연결되도록 준비하고 있습니다."
      />
    </>
  );
}
