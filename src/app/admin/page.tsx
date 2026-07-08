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

  return (
    <>
      <TopNav showAdmin />
      <main className="admin-page">
        <header className="admin-header">
          <div>
            <p className="admin-eyebrow">관리자</p>
            <h1>Aura-board 운영 현황</h1>
            <p>가입자별 사용량과 최근 가입 추이를 확인합니다.</p>
          </div>
          <Link href="/dashboard" className="admin-link-btn">
            대시보드
          </Link>
          <Link href="/admin/errors" className="admin-link-btn">
            에러 로그
          </Link>
        </header>

        <section className="admin-metric-grid" aria-label="전체 지표">
          <MetricCard label="가입자" value={`${totalUsers}명`} />
          <MetricCard label="보드" value={`${totalBoards}개`} />
          <MetricCard label="학급" value={`${totalClassrooms}개`} />
          <MetricCard label="학생" value={`${totalStudents}명`} />
          <MetricCard label="카드" value={`${totalCards}개`} />
          <MetricCard label="총 용량" value={formatBytes(totalStorageBytes)} />
        </section>

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
                  <th>최근 보드 활동</th>
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
