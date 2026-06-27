import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { hasPermission } from "@/lib/bank-permissions";
import { notFound } from "next/navigation";
import { ClassroomNav } from "@/components/classroom/ClassroomNav";
import { ClassroomCheckTab } from "@/components/classroom/ClassroomCheckTab";

type Props = { params: Promise<{ id: string }> };

export default async function ClassroomCheckPage({ params }: Props) {
  const { id } = await params;
  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  const classroom = await db.classroom.findUnique({
    where: { id },
    select: { id: true, name: true, teacherId: true },
  });
  if (!classroom) notFound();

  const isTeacher = user?.id === classroom.teacherId;
  const canManageTasks = isTeacher;
  const canCheck =
    isTeacher ||
    (student
      ? await hasPermission(id, { studentId: student.id }, "checks.manage")
      : false);
  if (!canCheck) notFound();

  return (
    <main className="classroom-page classroom-page-detail">
      <a href="/classroom" className="classroom-back-link">
        &larr; 학급 목록
      </a>
      <h1 className="classroom-page-title">{classroom.name} · 제출 체크</h1>
      <ClassroomNav classroomId={classroom.id} />
      <ClassroomCheckTab
        classroomId={classroom.id}
        canManageTasks={canManageTasks}
      />
    </main>
  );
}
