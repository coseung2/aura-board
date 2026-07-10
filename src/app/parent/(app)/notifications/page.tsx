import { db } from "@/lib/db";
import { getCurrentParent } from "@/lib/parent-session";
import { toParentPendingLink } from "@/lib/parent-pending-link";
import { ParentPendingLinks } from "@/components/parent/ParentPendingLinks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ParentNotificationsPage() {
  const current = (await getCurrentParent())!;
  const rows = await db.parentChildLink.findMany({
    where: {
      parentId: current.parent.id,
      status: "pending",
      deletedAt: null,
    },
    orderBy: { requestedAt: "desc" },
    select: {
      id: true,
      requestedAt: true,
      student: {
        select: {
          name: true,
          number: true,
          classroom: { select: { name: true } },
        },
      },
    },
  });
  const links = rows.map((row) => toParentPendingLink(row));

  return (
    <main className="parent-feed-page parent-notifications-page">
      <header className="parent-feed-section-header">
        <p>알림</p>
        <h1>자녀 연결 상태</h1>
        <span>승인 대기 중인 신청과 만료일을 확인할 수 있어요.</span>
      </header>
      {links.length > 0 ? (
        <ParentPendingLinks links={links} />
      ) : (
        <section className="parent-feed-empty">
          <strong>새 알림이 없어요</strong>
          <span>자녀 연결 신청 상태가 바뀌면 이곳에서 확인할 수 있어요.</span>
        </section>
      )}
    </main>
  );
}
