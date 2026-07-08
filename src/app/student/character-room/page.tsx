import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { StudentTopNav } from "@/components/StudentTopNav";
import { StudentFeatureComingSoon } from "@/components/student/StudentFeatureComingSoon";

export const dynamic = "force-dynamic";

export default async function CharacterRoomPage() {
  const teacher = await getCurrentUser().catch(() => null);
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/character-room");
  if (
    !isAdminEmail(teacher?.email) &&
    !isAdminEmail(student.classroom.teacher.email)
  ) {
    redirect("/student");
  }
  const duties = await getStudentDuties(student.id);

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={duties}
        showDevFeatures
      />
      <StudentFeatureComingSoon
        title="내 캐릭터"
        description="학생별 캐릭터 꾸미기 기능은 아직 개발 중이에요. 보유 아이템과 장착 기능을 안정화한 뒤 열어둘게요."
      />
    </>
  );
}
