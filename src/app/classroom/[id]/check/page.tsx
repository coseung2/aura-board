import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { hasPermission } from "@/lib/bank-permissions";
import { notFound } from "next/navigation";
import { ClassroomCheckTab } from "@/components/classroom/ClassroomCheckTab";

type Props = { params: Promise<{ id: string }> };

export default async function ClassroomCheckPage({ params }: Props) {
  const { id } = await params;
  const student = await getCurrentStudent().catch(() => null);
  const classroom = await db.classroom.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!classroom || !student || student.classroomId !== classroom.id) notFound();

  const canCheck = await hasPermission(
    id,
    { studentId: student.id },
    "checks.manage",
  );
  if (!canCheck) notFound();

  return (
    <main className="classroom-page classroom-page-detail">
      <a href="/student" className="classroom-back-link">
        &larr; 학생 홈
      </a>
      <h1 className="classroom-page-title">{classroom.name} · 제출 체크</h1>
      <ClassroomCheckTab
        classroomId={classroom.id}
        canManageTasks={false}
      />
    </main>
  );
}
