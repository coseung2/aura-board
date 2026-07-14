import { notFound } from "next/navigation";
import Link from "next/link";
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
      <header className="classroom-feature-header">
        <div>
          <Link href={`/classroom/${id}/dashboard`} className="classroom-back-link">
            &larr; 학급 대시보드
          </Link>
          <p className="classroom-feature-eyebrow">학생 제안 관리</p>
          <h1 className="classroom-page-title">일일 배너</h1>
          <p className="classroom-feature-description">
            학생이 보낸 문구와 이미지를 날짜별로 검토해 학생·학부모 앱에 게시합니다.
          </p>
        </div>
        <nav className="classroom-feature-switcher" aria-label="학급 활동 관리">
          <Link href={`/classroom/${id}/walking`}>걷기 현황</Link>
          <Link href={`/classroom/${id}/daily-banners`} aria-current="page">
            배너 관리
          </Link>
        </nav>
      </header>
      <DailyBannerModerationPanel classroomId={classroom.id} />
    </main>
  );
}
