import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { AdminForbidden, requireAdminUser } from "@/lib/admin-auth";
import { db } from "@/lib/db";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type UserUsageRow = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  boardCount: bigint | number;
  classroomCount: bigint | number;
  studentCount: bigint | number;
  cardCount: bigint | number;
  storageBytes: bigint | number | null;
  lastBoardUpdatedAt: Date | null;
};

export const metadata = {
  title: "관리자 · Aura-board",
};

export default async function AdminPage() {
  const auth = await requireAdminUser("/admin");
  if (!auth.authorized) return <AdminForbidden />;

  const [
    totalUsers,
    totalBoards,
    totalClassrooms,
    totalStudents,
    totalCards,
    userRows,
    recentUsers,
    activeBoards,
    recentErrors,
    serverErrors,
    recentAuditEvents,
    recentBoardActivityRows,
  ] = await Promise.all([
    db.user.count(),
    db.board.count(),
    db.classroom.count(),
    db.student.count(),
    db.card.count(),
    db.$queryRaw<UserUsageRow[]>`
      SELECT
        u.id,
        u.email,
        u.name,
        u."createdAt",
        (
          SELECT COUNT(*)
          FROM "BoardMember" bm
          WHERE bm."userId" = u.id AND bm.role = 'owner'
        ) AS "boardCount",
        (
          SELECT COUNT(*)
          FROM "Classroom" cl
          WHERE cl."teacherId" = u.id
        ) AS "classroomCount",
        (
          SELECT COUNT(*)
          FROM "Student" s
          JOIN "Classroom" cl ON cl.id = s."classroomId"
          WHERE cl."teacherId" = u.id
        ) AS "studentCount",
        (
          SELECT COUNT(*)
          FROM "Card" c
          JOIN "BoardMember" bm ON bm."boardId" = c."boardId"
          WHERE bm."userId" = u.id AND bm.role = 'owner'
        ) AS "cardCount",
        (
          COALESCE((
            SELECT SUM(COALESCE(c."fileSize", 0))
            FROM "Card" c
            JOIN "BoardMember" bm ON bm."boardId" = c."boardId"
            WHERE bm."userId" = u.id AND bm.role = 'owner'
          ), 0)
          +
          COALESCE((
            SELECT SUM(COALESCE(a."fileSize", 0))
            FROM "CardAttachment" a
            JOIN "Card" c ON c.id = a."cardId"
            JOIN "BoardMember" bm ON bm."boardId" = c."boardId"
            WHERE bm."userId" = u.id AND bm.role = 'owner'
          ), 0)
          +
          COALESCE((
            SELECT SUM(COALESCE(sa."sizeBytes", 0))
            FROM "StudentAsset" sa
            JOIN "Classroom" cl ON cl.id = sa."classroomId"
            WHERE cl."teacherId" = u.id
          ), 0)
        ) AS "storageBytes",
        (
          SELECT MAX(b."updatedAt")
          FROM "Board" b
          JOIN "BoardMember" bm ON bm."boardId" = b.id
          WHERE bm."userId" = u.id AND bm.role = 'owner'
        ) AS "lastBoardUpdatedAt"
      FROM "User" u
      ORDER BY u."createdAt" DESC
    `,
    db.user.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        },
      },
      select: { createdAt: true },
    }),
    db.board.count({
      where: { updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    db.errorLog.count({
      where: {
        environment: "production",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    db.errorLog.count({
      where: {
        environment: "production",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        status: { gte: 500 },
      },
    }),
    db.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        actorType: true,
        action: true,
        resourceType: true,
        createdAt: true,
      },
    }),
    db.boardActivityEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        action: true,
        actorType: true,
        createdAt: true,
        board: { select: { title: true, slug: true } },
      },
    }),
  ]);

  const users = userRows.map((row) => ({
    ...row,
    boardCount: toNumber(row.boardCount),
    classroomCount: toNumber(row.classroomCount),
    studentCount: toNumber(row.studentCount),
    cardCount: toNumber(row.cardCount),
    storageBytes: toNumber(row.storageBytes),
  }));
  const totalStorageBytes = users.reduce((sum, row) => sum + row.storageBytes, 0);
  const signupTrend = buildSignupTrend(recentUsers.map((user) => user.createdAt));
  const peakSignupCount = Math.max(...signupTrend.map((day) => day.count), 1);
  const weeklySignups = signupTrend.slice(-7).reduce((sum, day) => sum + day.count, 0);
  const healthTone = serverErrors > 0 ? "danger" : recentErrors > 0 ? "warning" : "good";
  const recentBoardActivities = recentBoardActivityRows.map((activity) => ({
    id: activity.id,
    action: activity.action,
    boardTitle: activity.board.title,
    boardSlug: activity.board.slug,
    actorLabel: formatActivityActor(activity.actorType),
    createdAt: activity.createdAt,
  }));

  return (
    <>
      <TopNav showAdmin />
      <main className="admin-page">
        <header className="admin-header admin-command-header">
          <div>
            <p className="admin-eyebrow">관리자</p>
            <h1>Aura-board 운영 현황</h1>
            <p>가입자별 사용량과 최근 가입 추이를 확인합니다.</p>
          </div>
          <div className="admin-header-actions">
          <span className={`admin-health-chip is-${healthTone}`}>
            {serverErrors > 0
              ? `서버 오류 ${serverErrors}건`
              : recentErrors > 0
                ? `주의 필요 ${recentErrors}건`
                : "최근 캡처 오류 없음"}
          </span>
          <Link href="/dashboard" className="admin-link-btn">
            대시보드
          </Link>
          <Link href="/admin/errors" className="admin-link-btn">
            에러 로그
          </Link>
          </div>
        </header>

        <section className="admin-metric-grid" aria-label="전체 지표">
          <MetricCard label="가입자" value={`${totalUsers}명`} />
          <MetricCard label="보드" value={`${totalBoards}개`} />
          <MetricCard label="학급" value={`${totalClassrooms}개`} />
          <MetricCard label="학생" value={`${totalStudents}명`} />
          <MetricCard label="카드" value={`${totalCards}개`} />
          <MetricCard label="총 용량" value={formatBytes(totalStorageBytes)} />
        </section>

        <div className="admin-overview-grid">
          <section className="admin-section admin-attention-panel" aria-label="운영 우선순위">
            <div className="admin-section-head">
              <div>
                <h2>운영 우선순위</h2>
                <p>지금 확인할 항목</p>
              </div>
              <Link href="/admin/errors" className="admin-section-link">전체 로그</Link>
            </div>
            <div className="admin-attention-list">
              <div className={`admin-attention-item is-${healthTone}`}>
                <span>오류 캡처</span>
                <strong>
                  {serverErrors > 0
                    ? `서버 오류 ${serverErrors}건`
                    : recentErrors > 0
                      ? `최근 오류 ${recentErrors}건`
                      : "캡처된 오류 없음"}
                </strong>
                <small>최근 24시간 수집 기준</small>
              </div>
              <div className="admin-attention-item">
                <span>이번 주 활성도</span>
                <strong>보드 {activeBoards}개 · 가입 {weeklySignups}명</strong>
                <small>최근 7일 기준</small>
              </div>
            </div>
          </section>

          <div className="admin-activity-stack">
            <section className="admin-section admin-activity-panel" aria-label="최근 보드 활동">
              <div className="admin-section-head admin-section-head-compact">
                <div>
                  <h2>최근 보드 활동</h2>
                  <p>보드 변경과 작성 활동</p>
                </div>
              </div>
              <ol className="admin-activity-list">
                {recentBoardActivities.length === 0 ? (
                  <li className="admin-activity-empty">최근 보드 활동이 없습니다.</li>
                ) : (
                  recentBoardActivities.map((activity) => (
                    <li key={activity.id}>
                      <span className="admin-activity-type">
                        {formatBoardActivityAction(activity.action)}
                      </span>
                      <div>
                        <Link
                          href={`/board/${activity.boardSlug}`}
                          className="admin-activity-board-link"
                        >
                          {activity.boardTitle}
                        </Link>
                        <small>
                          {activity.actorLabel} · {formatRelativeTime(activity.createdAt)}
                        </small>
                      </div>
                    </li>
                  ))
                )}
              </ol>
            </section>

            <section className="admin-section admin-activity-panel" aria-label="보안·관리 이력">
              <div className="admin-section-head admin-section-head-compact">
                <div>
                  <h2>보안·관리 이력</h2>
                  <p>감사 이벤트</p>
                </div>
              </div>
              <ol className="admin-activity-list">
                {recentAuditEvents.length === 0 ? (
                  <li className="admin-activity-empty">기록된 보안·관리 이력이 없습니다.</li>
                ) : (
                  recentAuditEvents.map((event) => (
                    <li key={event.id}>
                      <span className="admin-activity-type">
                        {formatActivityActor(event.actorType)}
                      </span>
                      <div>
                        <strong>{formatAuditAction(event.action)}</strong>
                        <small>
                          {event.resourceType ?? "서비스"} · {formatRelativeTime(event.createdAt)}
                        </small>
                      </div>
                    </li>
                  ))
                )}
              </ol>
            </section>
          </div>
        </div>

        <section className="admin-section">
          <div className="admin-section-head">
            <div>
              <h2>가입 추이</h2>
              <p>최근 30일 기준</p>
            </div>
          </div>
          <div className="admin-trend" aria-label="최근 30일 가입 추이">
            {signupTrend.map((day) => (
              <div key={day.key} className="admin-trend-day">
                <div
                  className="admin-trend-bar"
                  style={{ height: `${Math.max(8, (day.count / peakSignupCount) * 100)}%` }}
                  title={`${day.label}: ${day.count}명`}
                />
                <span>{day.shortLabel}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-head">
            <div>
              <h2>가입자별 사용량</h2>
              <p>보드 소유자 기준으로 카드와 첨부 용량을 집계합니다.</p>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>가입자</th>
                  <th>가입일</th>
                  <th>보드</th>
                  <th>학급</th>
                  <th>학생</th>
                  <th>카드</th>
                  <th>용량</th>
                  <th>최근 보드 변경</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="admin-user-cell">
                        <strong>{user.name || "이름 없음"}</strong>
                        <span>{user.email}</span>
                      </div>
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>{user.boardCount}</td>
                    <td>{user.classroomCount}</td>
                    <td>{user.studentCount}</td>
                    <td>{user.cardCount}</td>
                    <td>{formatBytes(user.storageBytes)}</td>
                    <td>
                      {user.lastBoardUpdatedAt
                        ? formatDateTime(user.lastBoardUpdatedAt)
                        : "-"}
                    </td>
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
  return (
    <article className="admin-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatBoardActivityAction(action: string): string {
  const labels: Record<string, string> = {
    "board.updated": "보드 변경",
    "board.settings.updated": "보드 설정 변경",
    "section.created": "섹션 생성",
    "section.updated": "섹션 변경",
    "section.deleted": "섹션 삭제",
    "card.created": "카드 작성",
    "card.updated": "카드 수정",
    "card.deleted": "카드 삭제",
    "card.moved": "카드 이동",
    "comment.created": "댓글 작성",
    "like.created": "좋아요",
    "like.deleted": "좋아요 취소",
  };
  return labels[action] ?? action;
}

function formatActivityActor(actorType: string): string {
  const labels: Record<string, string> = {
    teacher: "교사",
    student: "학생",
    guest: "공유 방문자",
    system: "시스템",
  };
  return labels[actorType] ?? actorType;
}

function formatAuditAction(action: string): string {
  if (action.startsWith("admin.rotate_tokens.")) return "관리자 토큰 교체";
  const labels: Record<string, string> = {
    "vibe.moderation.approve": "Vibe 프로젝트 승인",
    "vibe.moderation.reject": "Vibe 프로젝트 반려",
    "billing.refund": "결제 환불",
  };
  return labels[action] ?? action;
}

function formatRelativeTime(date: Date): string {
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function toNumber(value: bigint | number | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return 0;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
}

function buildSignupTrend(createdAts: Date[]) {
  const counts = new Map<string, number>();
  for (const createdAt of createdAts) {
    const key = toKstDayKey(createdAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  return Array.from({ length: 30 }, (_, index) => {
    const day = new Date(nowKst);
    day.setUTCDate(nowKst.getUTCDate() - (29 - index));
    const key = day.toISOString().slice(0, 10);
    const [, month, date] = key.split("-");
    return {
      key,
      label: `${month}.${date}`,
      shortLabel: index % 5 === 0 || index === 29 ? `${Number(month)}/${Number(date)}` : "",
      count: counts.get(key) ?? 0,
    };
  });
}

function toKstDayKey(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}
