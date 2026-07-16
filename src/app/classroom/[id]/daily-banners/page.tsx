import { notFound } from "next/navigation";
import { ClassroomFeatureHeader } from "@/components/classroom/ClassroomFeatureHeader";
import { DailyBannerModerationPanel } from "@/components/classroom/DailyBannerModerationPanel";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function ClassroomDailyBannersPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const classroom = await db.classroom.findUnique({ where: { id }, select: { id: true, name: true, teacherId: true } });
  if (!classroom || classroom.teacherId !== user?.id) notFound();
  return (
    <main className="classroom-page classroom-page-detail classroom-feature-page">
      <ClassroomFeatureHeader
        classroomId={id}
        eyebrow="학생 제안 관리"
        active="daily-banners"
      />
      <DailyBannerModerationPanel classroomId={classroom.id} />
    </main>
  );
}
