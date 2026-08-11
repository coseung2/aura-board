import { notFound } from "next/navigation";

import {
  ClassroomAssignmentsView,
  ClassroomAssignmentDistributeButton,
  ArchivedAssignmentsButton,
} from "@/components/classroom/ClassroomAssignmentsView";
import { ClassroomSectionHeader } from "@/components/classroom/ClassroomSectionHeader";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export default async function ClassroomAssignmentsPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const classroom = await db.classroom.findUnique({
    where: { id },
    select: { id: true, name: true, teacherId: true },
  });

  if (!classroom || classroom.teacherId !== user.id) {
    notFound();
  }

  return (
    <main className="classroom-page classroom-page-detail classroom-section-page">
      <ClassroomSectionHeader
        classroomId={classroom.id}
        eyebrow={classroom.name}
        title="과제 현황"
        ariaLabel="과제 현황 메뉴"
        links={[]}
        activeKey="assignments"
        actions={
          <>
            <ClassroomAssignmentDistributeButton classroomId={classroom.id} />
            <ArchivedAssignmentsButton classroomId={classroom.id} />
          </>
        }
      />
      <ClassroomAssignmentsView classroomId={classroom.id} />
    </main>
  );
}
