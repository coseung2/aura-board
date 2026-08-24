import { notFound } from "next/navigation";
import { ClassroomCleaningInspector } from "@/components/classroom/ClassroomCleaningInspector";
import { hasPermission } from "@/lib/bank-permissions";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";

type Props = { params: Promise<{ id: string }> };

export default async function ClassroomCleaningPage({ params }: Props) {
  const { id } = await params;
  const student = await getCurrentStudent().catch(() => null);
  const classroom = await db.classroom.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!classroom || !student || student.classroomId !== classroom.id) notFound();

  const canInspect = await hasPermission(
    id,
    { studentId: student.id },
    "inspections.cleaning",
  );
  if (!canInspect) notFound();

  return (
    <main className="classroom-page classroom-page-detail">
      <a href="/student" className="classroom-back-link">
        &larr; 학생 홈
      </a>
      <h1 className="classroom-page-title">{classroom.name} · 청소 검사</h1>
      <ClassroomCleaningInspector classroomId={id} />
    </main>
  );
}
