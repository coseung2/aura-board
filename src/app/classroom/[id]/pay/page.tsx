import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { hasPermission } from "@/lib/bank-permissions";
import { notFound } from "next/navigation";
import { ClassroomPayTab } from "@/components/classroom/ClassroomPayTab";

type Props = { params: Promise<{ id: string }> };

export default async function ClassroomPayPage({ params }: Props) {
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
  const canCharge =
    isTeacher ||
    (student
      ? await hasPermission(id, { studentId: student.id }, "store.charge")
      : false);
  if (!canCharge) notFound();

  return (
    <main className="classroom-page classroom-page-detail">
      <a href="/classroom" className="classroom-back-link">
        &larr; 학급 목록
      </a>
      <h1 className="classroom-page-title">{classroom.name} · 결제</h1>
      <ClassroomPayTab classroomId={classroom.id} />
    </main>
  );
}
