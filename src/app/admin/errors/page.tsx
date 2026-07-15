import { TopNav } from "@/components/TopNav";
import { AdminFeatureHeader } from "@/components/admin/AdminFeatureHeader";
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
  const loggedActorIds = Array.from(
    new Set(logs.map((log) => log.userId).filter((id): id is string => Boolean(id))),
  );
  const loggedActorEmails = Array.from(
    new Set(logs.map((log) => log.userEmail).filter((email): email is string => Boolean(email))),
  );
  const [loggedUsers, loggedStudents] = await Promise.all([
    db.user.findMany({
      where: {
        OR: [
          { id: { in: loggedActorIds } },
          { email: { in: loggedActorEmails } },
        ],
      },
      select: { id: true, name: true, email: true },
    }),
    db.student.findMany({
      where: { id: { in: loggedActorIds } },
      select: {
        id: true,
        name: true,
        classroom: {
          select: { teacher: { select: { name: true, email: true } } },
        },
      },
    }),
  ]);
  const loggedUserById = new Map(loggedUsers.map((user) => [user.id, user]));
  const loggedUserByEmail = new Map(loggedUsers.map((user) => [user.email, user]));
  const loggedStudentById = new Map(loggedStudents.map((student) => [student.id, student]));

  return (
    <>
      <TopNav showAdmin />
      <main className="admin-page">
        <AdminFeatureHeader
          eyebrow="오류 모니터링"
          description="서버에서 기록한 최근 오류를 확인합니다."
          active="errors"
        />

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
                  logs.map((log) => {
                    const actor = formatErrorActor(
                      log.userId,
                      log.userEmail,
                      loggedUserById,
                      loggedUserByEmail,
                      loggedStudentById,
                    );
                    return (
                    <tr key={log.id}>
                      <td>{formatDateTime(log.createdAt)}</td>
                      <td>
                        <div className="admin-user-cell">
                          <strong>{actor.primary}</strong>
                          {actor.secondary && <span>{actor.secondary}</span>}
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
                    );
                  })
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

type ErrorUser = { name: string; email: string };
type ErrorStudent = {
  name: string;
  classroom: { teacher: { name: string; email: string } };
};

function formatErrorActor(
  actorId: string | null,
  recordedEmail: string | null,
  users: Map<string, ErrorUser>,
  usersByEmail: Map<string, ErrorUser>,
  students: Map<string, ErrorStudent>,
): { primary: string; secondary: string | null } {
  if (actorId) {
    const user = users.get(actorId);
    if (user) {
      const name = user.name.trim();
      return {
        primary: name || user.email,
        secondary: name ? user.email : null,
      };
    }

    const student = students.get(actorId);
    if (student) {
      const teacherName = student.classroom.teacher.name.trim()
        || student.classroom.teacher.email;
      return {
        primary: `${student.name} 학생`,
        secondary: `소속 교사 ${teacherName}`,
      };
    }
  }

  if (recordedEmail) {
    const user = usersByEmail.get(recordedEmail);
    if (user) {
      const name = user.name.trim();
      return {
        primary: name || user.email,
        secondary: name ? user.email : null,
      };
    }
  }

  return {
    primary: recordedEmail ?? "알 수 없음",
    secondary: actorId,
  };
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
