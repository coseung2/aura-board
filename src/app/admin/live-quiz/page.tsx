import { AdminFeatureHeader } from "@/components/admin/AdminFeatureHeader";
import { LiveQuizAdminPanel } from "@/components/admin/LiveQuizAdminPanel";
import { TopNav } from "@/components/TopNav";
import { AdminForbidden } from "@/lib/admin-auth";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getLiveQuizAdminData } from "@/lib/live-quiz/server";

export const metadata = {
  title: "라이브 퀴즈 관리 · Aura-board",
};

export const dynamic = "force-dynamic";

export default async function AdminLiveQuizPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login?callbackUrl=/admin/live-quiz");
  if (!isAdminEmail(user.email)) return <AdminForbidden />;

  const data = await getLiveQuizAdminData();
  return (
    <>
      <TopNav showAdmin />
      <main className="admin-page">
        <AdminFeatureHeader
          eyebrow="콘텐츠 운영"
          description="매일 오후 1시 30분 전체 이용자에게 열리는 4지선다 라이브 퀴즈의 문제 풀과 추천 문제를 관리합니다."
          active="live-quiz"
        />

        <section
          className="admin-metric-grid admin-metric-grid-compact"
          aria-label="라이브 퀴즈 운영 현황"
        >
          <MetricCard label="승인 문제" value={`${data.approvedCount}개`} />
          <MetricCard label="검수 대기" value={`${data.pendingCount}개`} />
          <MetricCard label="반려" value={`${data.rejectedCount}개`} />
          <MetricCard label="방송 시각" value="매일 13:30" />
        </section>

        <LiveQuizAdminPanel pending={data.pending} approved={data.approved} />
      </main>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="admin-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
