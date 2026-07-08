import { notFound } from "next/navigation";
import { ClassroomMorningDashboard } from "@/components/classroom/ClassroomMorningDashboard";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";

type Props = { params: Promise<{ id: string }> };

export default async function ClassroomMorningPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser().catch(() => null);
  if (!user) notFound();

  const classroom = await db.classroom.findUnique({
    where: { id },
    select: { id: true, teacherId: true },
  });
  if (!classroom || classroom.teacherId !== user.id) notFound();

  return (
    <main className="classroom-page classroom-page-detail classroom-morning">
      <ClassroomMorningDashboard
        classroomId={id}
        showDevFeatures={isAdminEmail(user.email)}
      />
    </main>
  );
}
