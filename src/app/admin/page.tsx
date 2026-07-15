import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { AdminFeatureHeader } from "@/components/admin/AdminFeatureHeader";
import {
  AdminUsageTable,
  type AdminUsageTableRow,
} from "@/components/admin/AdminUsageTable";
import {
  AdminSignupActivityChart,
  type AdminTrendPoint,
} from "@/components/admin/AdminSignupActivityChart";
import { AdminForbidden, requireAdminUser } from "@/lib/admin-auth";
import {
  formatActivityRelativeTime,
  formatAdminActivityActor,
  formatBoardActivityAction,
  loadAdminActivityActors,
} from "@/lib/admin-activity";
import { db } from "@/lib/db";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ADMIN_OVERVIEW_ITEM_LIMIT = 5;
const ADMIN_TREND_DAYS = 365;

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

type DailyTrendRow = {
  day: string;
  count: bigint | number;
};

export const metadata = {
  title: "관리자 · Aura-board",
};

export default async function AdminPage() {
  const auth = await requireAdminUser("/admin");
  if (!auth.authorized) return <AdminForbidden />;
  const trendStart = startOfKstDay(ADMIN_TREND_DAYS - 1);

  const [
    totalUsers,
    totalBoards,
    totalClassrooms,
    totalStudents,
    totalCards,
    userRows,
    signupTrendRows,
    boardActivityTrendRows,
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
    db.$queryRaw<DailyTrendRow[]>`
      SELECT TO_CHAR("createdAt" + INTERVAL '9 hours', 'YYYY-MM-DD') AS "day", COUNT(*) AS "count"
      FROM "User"
      WHERE "createdAt" >= ${trendStart}
      GROUP BY 1
      ORDER BY 1
    `,
    db.$queryRaw<DailyTrendRow[]>`
      SELECT TO_CHAR("createdAt" + INTERVAL '9 hours', 'YYYY-MM-DD') AS "day", COUNT(*) AS "count"
      FROM "BoardActivityEvent"
      WHERE "createdAt" >= ${trendStart}
      GROUP BY 1
      ORDER BY 1
    `,
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
      take: ADMIN_OVERVIEW_ITEM_LIMIT,
      select: {
        id: true,
        actorType: true,
        actorId: true,
        action: true,
        resourceType: true,
        createdAt: true,
      },
    }),
    db.boardActivityEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: ADMIN_OVERVIEW_ITEM_LIMIT,
      select: {
        id: true,
        action: true,
        actorType: true,
        actorId: true,
        createdAt: true,
        board: { select: { title: true, slug: true } },
      },
    }),
  ]);

  const actors = await loadAdminActivityActors([
    ...recentAuditEvents,
    ...recentBoardActivityRows,
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
  const usageTableRows: AdminUsageTableRow[] = users.map((user) => ({
    ...user,
    createdAt: user.createdAt.toISOString(),
    lastBoardUpdatedAt: user.lastBoardUpdatedAt?.toISOString() ?? null,
  }));
  const signupTrend = buildAdminTrendPoints(
    signupTrendRows,
    boardActivityTrendRows,
  );
  const weeklySignups = signupTrend
    .slice(-7)
    .reduce((sum, day) => sum + day.signups, 0);
  const healthTone = serverErrors > 0 ? "danger" : recentErrors > 0 ? "warning" : "good";
  const recentBoardActivities = recentBoardActivityRows.map((activity) => ({
    id: activity.id,
    action: activity.action,
    boardTitle: activity.board.title,
    boardSlug: activity.board.slug,
    actorLabel: formatAdminActivityActor(
      activity.actorType,
      activity.actorId,
      actors,
    ),
    createdAt: activity.createdAt,
  }));

  return (
    <>
      <TopNav showAdmin />
      <main className="admin-page">
        <AdminFeatureHeader
          eyebrow="서비스 운영"
          description="가입자별 사용량과 최근 가입 추이를 확인합니다."
          active="overview"
        />

        <section className="admin-metric-grid" aria-label="전체 지표">
          <MetricCard label="가입자" value={`${totalUsers}명`} />
          <MetricCard label="보드" value={`${totalBoards}개`} />
          <MetricCard label="학급" value={`${totalClassrooms}개`} />
          <MetricCard label="학생" value={`${totalStudents}명`} />
          <MetricCard label="카드" value={`${totalCards}개`} />
          <MetricCard label="총 용량" value={formatBytes(totalStorageBytes)} />
        </section>

        <div className="admin-overview-grid">
          <div className="admin-overview-primary">
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
            <AdminSignupActivityChart points={signupTrend} />
          </div>

          <div className="admin-activity-stack">
            <section className="admin-section admin-activity-panel" aria-label="최근 보드 활동">
              <div className="admin-section-head admin-section-head-compact">
                <div>
                  <h2>최근 보드 활동</h2>
                  <p>보드 변경과 작성 활동</p>
                </div>
                <Link href="/admin/activity" className="admin-section-link">전체 보기</Link>
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
                          {activity.actorLabel} · {formatActivityRelativeTime(activity.createdAt)}
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
                        {formatAdminActivityActor(
                          event.actorType,
                          event.actorId,
                          actors,
                        )}
                      </span>
                      <div>
                        <strong>{formatAuditAction(event.action)}</strong>
                        <small>
                          {event.resourceType ?? "서비스"} · {formatActivityRelativeTime(event.createdAt)}
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
              <h2>가입자별 사용량</h2>
              <p>보드 소유자 기준으로 카드와 첨부 용량을 집계합니다.</p>
            </div>
          </div>

          <AdminUsageTable rows={usageTableRows} />
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

function formatAuditAction(action: string): string {
  if (action.startsWith("admin.rotate_tokens.")) return "관리자 토큰 교체";
  const labels: Record<string, string> = {
    "vibe.moderation.approve": "Vibe 프로젝트 승인",
    "vibe.moderation.reject": "Vibe 프로젝트 반려",
    "billing.refund": "결제 환불",
  };
  return labels[action] ?? action;
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

function buildAdminTrendPoints(
  signupRows: DailyTrendRow[],
  activityRows: DailyTrendRow[],
): AdminTrendPoint[] {
  const signupCounts = new Map<string, number>();
  const activityCounts = new Map<string, number>();
  for (const row of signupRows) {
    signupCounts.set(row.day, toNumber(row.count));
  }
  for (const row of activityRows) {
    activityCounts.set(row.day, toNumber(row.count));
  }

  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  return Array.from({ length: ADMIN_TREND_DAYS }, (_, index) => {
    const day = new Date(nowKst);
    day.setUTCDate(nowKst.getUTCDate() - (ADMIN_TREND_DAYS - 1 - index));
    const key = day.toISOString().slice(0, 10);
    return {
      date: key,
      signups: signupCounts.get(key) ?? 0,
      boardActivities: activityCounts.get(key) ?? 0,
    };
  });
}

function startOfKstDay(daysAgo: number): Date {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  nowKst.setUTCHours(0, 0, 0, 0);
  nowKst.setUTCDate(nowKst.getUTCDate() - daysAgo);
  return new Date(nowKst.getTime() - KST_OFFSET_MS);
}

