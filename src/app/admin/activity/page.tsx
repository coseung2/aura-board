import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { AdminForbidden, requireAdminUser } from "@/lib/admin-auth";
import {
  formatAdminActivityActor,
  formatBoardActivityAction,
  loadAdminActivityActors,
} from "@/lib/admin-activity";
import { db } from "@/lib/db";

const PAGE_SIZE = 50;

export const metadata = {
  title: "보드 활동 · Aura-board",
};

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const auth = await requireAdminUser("/admin/activity");
  if (!auth.authorized) return <AdminForbidden />;

  const requestedPage = Number.parseInt((await searchParams).page ?? "1", 10);
  const normalizedPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [totalActivities, recentActivities] = await Promise.all([
    db.boardActivityEvent.count(),
    db.boardActivityEvent.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalActivities / PAGE_SIZE));
  const page = Math.min(normalizedPage, totalPages);
  const activities = await db.boardActivityEvent.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      action: true,
      actorType: true,
      actorId: true,
      metadata: true,
      createdAt: true,
      board: { select: { title: true, slug: true } },
    },
  });
  const actors = await loadAdminActivityActors(activities);

  return (
    <>
      <TopNav showAdmin />
      <main className="admin-page">
        <header className="admin-header">
          <div>
            <p className="admin-eyebrow">관리자</p>
            <h1>최근 보드 활동</h1>
            <p>보드, 섹션, 카드와 참여 활동을 최신순으로 확인합니다.</p>
          </div>
          <Link href="/admin" className="admin-link-btn">
            운영 현황
          </Link>
        </header>

        <section className="admin-metric-grid admin-metric-grid-compact" aria-label="보드 활동 지표">
          <MetricCard label="전체 활동" value={`${totalActivities}건`} />
          <MetricCard label="최근 24시간" value={`${recentActivities}건`} />
          <MetricCard label="현재 페이지" value={`${page} / ${totalPages}`} />
        </section>

        <section className="admin-section">
          <div className="admin-section-head">
            <div>
              <h2>활동 상세</h2>
              <p>페이지당 최신 {PAGE_SIZE}건을 표시합니다.</p>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table admin-activity-detail-table">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>활동</th>
                  <th>보드</th>
                  <th>실행자</th>
                  <th>상세</th>
                </tr>
              </thead>
              <tbody>
                {activities.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="admin-empty-cell">
                      기록된 보드 활동이 없습니다.
                    </td>
                  </tr>
                ) : (
                  activities.map((activity) => (
                    <tr key={activity.id}>
                      <td>{formatDateTime(activity.createdAt)}</td>
                      <td>
                        <strong>{formatBoardActivityAction(activity.action)}</strong>
                        <code className="admin-code admin-activity-code">{activity.action}</code>
                      </td>
                      <td>
                        <Link
                          href={`/board/${activity.board.slug}`}
                          className="admin-activity-board-link"
                        >
                          {activity.board.title}
                        </Link>
                      </td>
                      <td>
                        <div className="admin-user-cell">
                          <strong>
                            {formatAdminActivityActor(
                              activity.actorType,
                              activity.actorId,
                              actors,
                            )}
                          </strong>
                          <span>{activity.actorType}</span>
                        </div>
                      </td>
                      <td>
                        {activity.metadata ? (
                          <details className="admin-error-details">
                            <summary>메타데이터 보기</summary>
                            <pre>{JSON.stringify(activity.metadata, null, 2)}</pre>
                          </details>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <nav className="admin-pagination" aria-label="보드 활동 페이지 이동">
            {page > 1 ? (
              <Link href={`/admin/activity?page=${page - 1}`} className="admin-link-btn">
                이전
              </Link>
            ) : (
              <span />
            )}
            <span>{page} / {totalPages}</span>
            {page < totalPages ? (
              <Link href={`/admin/activity?page=${page + 1}`} className="admin-link-btn">
                다음
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </section>
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

function formatDateTime(date: Date): string {
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
}
