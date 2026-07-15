import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { AdminFeatureHeader } from "@/components/admin/AdminFeatureHeader";
import { DailyBannerAdminActions } from "@/components/admin/DailyBannerAdminActions";
import { AdminForbidden, requireAdminUser } from "@/lib/admin-auth";
import { dateToKstDay } from "@/lib/daily-banner";
import { db } from "@/lib/db";

export const metadata = { title: "일일 배너 관리 · Aura-board" };

export default async function AdminDailyBannersPage() {
  const auth = await requireAdminUser("/admin/daily-banners");
  if (!auth.authorized) return <AdminForbidden />;

  const [publications, pendingCount] = await Promise.all([
    db.dailyBannerPublication.findMany({
      include: {
        submission: {
          include: {
            student: { select: { name: true, number: true } },
            classroom: { select: { id: true, name: true } },
          },
        },
        approvedBy: { select: { name: true, email: true } },
      },
      orderBy: [{ day: "asc" }],
      take: 90,
    }),
    db.dailyBannerSubmission.count({ where: { status: "pending" } }),
  ]);

  return (
    <>
      <TopNav showAdmin />
      <main className="admin-page">
        <AdminFeatureHeader
          eyebrow="콘텐츠 운영"
          description="전교 학생·학부모 화면에 노출되는 하루 한 개의 배너를 확인하고 게시를 취소할 수 있습니다."
          active="daily-banners"
        />

        <section className="admin-metric-grid admin-metric-grid-compact" aria-label="배너 운영 현황">
          <MetricCard label="확정 배너" value={`${publications.length}건`} />
          <MetricCard label="심사 대기" value={`${pendingCount}건`} />
          <MetricCard label="운영 규칙" value="하루 1개" />
        </section>

        <section className="admin-section">
          <div className="admin-section-head">
            <div>
              <h2>게시 일정</h2>
              <p>게시를 취소하면 해당 신청작은 심사 대기로 돌아가며, 그 날짜를 다시 승인할 수 있습니다.</p>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>날짜</th><th>형식</th><th>제작 학생</th><th>신청 학급</th><th>승인 교사</th><th>관리</th>
                </tr>
              </thead>
              <tbody>
                {publications.length === 0 ? (
                  <tr><td colSpan={6} className="admin-empty-cell">확정된 배너가 없습니다.</td></tr>
                ) : publications.map((publication) => (
                  <tr key={publication.id}>
                    <td>{dateToKstDay(publication.day)}</td>
                    <td>{publication.submission.kind === "image" ? "이미지" : "흐르는 문구"}</td>
                    <td>{publication.submission.student.name}{publication.submission.student.number ? ` (${publication.submission.student.number}번)` : ""}</td>
                    <td><Link href={`/classroom/${publication.submission.classroom.id}/students`}>{publication.submission.classroom.name}</Link></td>
                    <td>{publication.approvedBy.name || publication.approvedBy.email}</td>
                    <td><DailyBannerAdminActions publicationId={publication.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <article className="admin-metric-card"><span>{label}</span><strong>{value}</strong></article>;
}
