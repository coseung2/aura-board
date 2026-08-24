import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { hasPermission } from "@/lib/bank-permissions";
import { notFound } from "next/navigation";
import { ClassroomPayTab } from "@/components/classroom/ClassroomPayTab";

type Props = { params: Promise<{ id: string }> };

export default async function ClassroomPayPage({ params }: Props) {
  const { id } = await params;
  const student = await getCurrentStudent().catch(() => null);
  const classroom = await db.classroom.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!classroom || !student || student.classroomId !== classroom.id) notFound();

  const canCharge = await hasPermission(
    id,
    { studentId: student.id },
    "store.charge",
  );
  if (!canCharge) notFound();

  return (
    <main className="classroom-page classroom-page-detail">
      <a href="/student" className="classroom-back-link">
        &larr; 학생 홈
      </a>
      <h1 className="classroom-page-title">{classroom.name} · 매점 결제</h1>
      <ClassroomPayTab classroomId={classroom.id} />
    </main>
  );
}
