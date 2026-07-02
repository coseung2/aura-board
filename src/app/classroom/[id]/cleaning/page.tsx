import { notFound } from "next/navigation";
import { ClassroomCleaningInspector } from "@/components/classroom/ClassroomCleaningInspector";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/bank-permissions";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";

type Props = { params: Promise<{ id: string }> };

export default async function ClassroomCleaningPage({ params }: Props) {
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
  const canInspect =
    isTeacher ||
    (student
      ? await hasPermission(id, { studentId: student.id }, "inspections.cleaning")
      : false);
  if (!canInspect) notFound();

  return (
    <main className="classroom-page classroom-page-detail">
      <a href="/classroom" className="classroom-back-link">
        &larr; 학급 목록
      </a>
      <h1 className="classroom-page-title">{classroom.name} · 청소 검사</h1>
      <ClassroomCleaningInspector classroomId={id} />
    </main>
  );
}
