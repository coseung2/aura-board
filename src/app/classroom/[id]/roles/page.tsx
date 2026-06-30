import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import { ClassroomRolesTab } from "@/components/classroom/ClassroomRolesTab";

type Props = { params: Promise<{ id: string }> };

export default async function ClassroomRolesPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const classroom = await db.classroom.findUnique({
    where: { id },
    select: { id: true, name: true, teacherId: true },
  });
  if (!classroom || classroom.teacherId !== user.id) notFound();

  return (
    <main className="classroom-page classroom-page-detail">
      <a href="/classroom" className="classroom-back-link">
        &larr; 학급 목록
      </a>
      <h1 className="classroom-page-title">{classroom.name}</h1>
      <ClassroomRolesTab classroomId={classroom.id} />
    </main>
  );
}
