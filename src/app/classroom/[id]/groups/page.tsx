import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { loadClassroomDefaultGroups } from "@/lib/default-groups";
import { ClassroomGroupsTab } from "@/components/classroom/ClassroomGroupsTab";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ClassroomGroupsPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();

  const classroom = await db.classroom.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      teacherId: true,
      students: {
        orderBy: [{ number: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, number: true, gender: true },
      },
    },
  });
  if (!classroom || classroom.teacherId !== user.id) {
    notFound();
  }

  const groups = await loadClassroomDefaultGroups(db, classroom.id);

  return (
    <main className="classroom-page classroom-page-detail">
      <a href="/classroom" className="classroom-back-link">
        &larr; 학급 목록
      </a>
      <h1 className="classroom-page-title">{classroom.name}</h1>
      <ClassroomGroupsTab
        classroomId={classroom.id}
        students={classroom.students}
        initialGroups={groups}
      />
    </main>
  );
}
