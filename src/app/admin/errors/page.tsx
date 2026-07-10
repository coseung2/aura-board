import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { AdminForbidden, requireAdminUser } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { ErrorLogCopyButton } from "@/components/admin/ErrorLogCopyButton";

export const metadata = {
  title: "에러 로그 · Aura-board",
};

export default async function AdminErrorsPage() {
  const auth = await requireAdminUser("/admin/errors");
  if (!auth.authorized) return <AdminForbidden />;

  const [logs, totalErrors, recentErrors] = await Promise.all([
    db.errorLog.findMany({
      where: { environment: "production" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.errorLog.count({ where: { environment: "production" } }),
    db.errorLog.count({
      where: {
        environment: "production",
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  return (
    <>
      <TopNav showAdmin />
      <main className="admin-page">
        <header className="admin-header">
          <div>
            <p className="admin-eyebrow">관리자</p>
            <h1>에러 로그</h1>
            <p>서버에서 기록한 최근 오류를 확인합니다.</p>
          </div>
          <Link href="/admin" className="admin-link-btn">
            운영 현황
          </Link>
        </header>

        <section className="admin-metric-grid admin-metric-grid-compact" aria-label="에러 지표">
          <MetricCard label="전체 에러" value={`${totalErrors}건`} />
          <MetricCard label="최근 24시간" value={`${recentErrors}건`} />
          <MetricCard label="표시 중" value={`${logs.length}건`} />
        </section>

        <section className="admin-section">
          <div className="admin-section-head">
            <div>
              <h2>최근 에러</h2>
              <p>최신순 100건까지 표시합니다.</p>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table admin-error-table">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>사용자</th>
                  <th>기능</th>
                  <th>경로</th>
                  <th>상태</th>
                  <th>메시지</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="admin-empty-cell">
                      기록된 에러가 없습니다.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDateTime(log.createdAt)}</td>
                      <td>
                        <div className="admin-user-cell">
                          <strong>{log.userEmail ?? "알 수 없음"}</strong>
                          {log.userId && <span>{log.userId}</span>}
                        </div>
                      </td>
                      <td>{featureLabel(log.feature)}</td>
                      <td>
                        <code className="admin-code">{log.path ?? "-"}</code>
                      </td>
                      <td>
                        <span className={statusClassName(log.status)}>
                          {log.status ?? "-"}
                        </span>
                      </td>
                      <td>
                        <div className="admin-error-message">
                          <details className="admin-error-details">
                            <summary>{log.message}</summary>
                            {log.stack && <pre>{log.stack}</pre>}
                          </details>
                          <ErrorLogCopyButton value={log.message} />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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

function featureLabel(feature: string): string {
  const labels: Record<string, string> = {
    upload: "업로드",
    "upload.preview": "미리보기",
  };
  return labels[feature] ?? feature;
}

function statusClassName(status: number | null): string {
  const base = "admin-status-pill";
  if (!status) return base;
  if (status >= 500) return `${base} admin-status-pill-danger`;
  if (status >= 400) return `${base} admin-status-pill-warning`;
  return base;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
