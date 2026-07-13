import { notFound } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { DailyBannerModerationPanel } from "@/components/classroom/DailyBannerModerationPanel";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function ClassroomDailyBannersPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const classroom = await db.classroom.findUnique({ where: { id }, select: { id: true, name: true, teacherId: true } });
  if (!classroom || classroom.teacherId !== user?.id) notFound();
  return <><TopNav /><main className="classroom-page"><header className="classroom-page-header"><h1>{classroom.name} 일일 배너</h1></header><DailyBannerModerationPanel classroomId={classroom.id} /></main></>;
}
