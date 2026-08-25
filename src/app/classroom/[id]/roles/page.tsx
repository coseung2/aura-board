import { notFound } from "next/navigation";

import { ClassroomRolesView } from "@/components/classroom/ClassroomRolesView";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export default async function ClassroomRolesPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const classroom = await db.classroom.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      teacherId: true,
      currency: { select: { unitLabel: true } },
      students: {
        orderBy: [{ number: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, number: true },
      },
    },
  });

  if (!classroom || classroom.teacherId !== user.id) {
    notFound();
  }

  return (
    <main className="classroom-page classroom-page-detail classroom-section-page">
      <ClassroomRolesView
        classroomId={classroom.id}
        classroomName={classroom.name}
        unit={classroom.currency?.unitLabel ?? "원"}
        students={classroom.students}
      />
    </main>
  );
}
