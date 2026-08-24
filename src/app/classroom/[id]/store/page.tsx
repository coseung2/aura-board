import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { hasPermission } from "@/lib/bank-permissions";
import { notFound } from "next/navigation";
import { ClassroomStoreTab } from "@/components/classroom/ClassroomStoreTab";

type Props = { params: Promise<{ id: string }> };

export default async function ClassroomStorePage({ params }: Props) {
  const { id } = await params;
  const student = await getCurrentStudent().catch(() => null);
  const classroom = await db.classroom.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!classroom || !student || student.classroomId !== classroom.id) notFound();

  const canManage = await hasPermission(
    id,
    { studentId: student.id },
    "store.item.manage",
  );
  if (!canManage) notFound();

  return (
    <main className="classroom-page classroom-page-detail">
      <a href={`/classroom/${classroom.id}/pay`} className="classroom-back-link">
        &larr; 매점 결제
      </a>
      <h1 className="classroom-page-title">{classroom.name} · 상품 관리</h1>
      <ClassroomStoreTab classroomId={classroom.id} canManage={true} />
    </main>
  );
}
