import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { StudentTopNav } from "@/components/StudentTopNav";
import { StudentFeatureComingSoon } from "@/components/student/StudentFeatureComingSoon";

export const dynamic = "force-dynamic";

export default async function CharacterShopPage() {
  const teacher = await getCurrentUser().catch(() => null);
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/character-shop");
  // 캐릭터 상점은 admin teacher 또는 admin teacher 학급 학생만 미리 볼 수 있다.
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
      />
      <StudentFeatureComingSoon
        title="캐릭터 상점"
        description="캐릭터 상점은 아직 개발 중이에요. 학생별 보상과 아이템 구매 흐름을 더 안전하게 다듬고 있습니다."
      />
    </>
  );
}
