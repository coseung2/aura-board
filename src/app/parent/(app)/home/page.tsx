import { redirect } from "next/navigation";
import { ParentHomeGrid } from "@/components/parent/ParentHomeGrid";
import type { ChildRow } from "@/components/parent/ParentChildSelector";
import type { ParentPendingLink } from "@/components/parent/ParentPendingLinks";
import { db } from "@/lib/db";
import { toParentPendingLink } from "@/lib/parent-pending-link";
import { getCurrentParent } from "@/lib/parent-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ParentHomePage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string; error?: string }>;
}) {
  const current = await getCurrentParent();
  if (!current) redirect("/login?role=parent&error=session_required");

  const links = await db.parentChildLink.findMany({
    where: {
      parentId: current.parent.id,
      status: { in: ["active", "pending"] },
      deletedAt: null,
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          number: true,
          classroom: { select: { name: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { requestedAt: "asc" }],
  });

  const childRows: ChildRow[] = links
    .filter((link) => link.status === "active")
    .map((link) => ({
      studentId: link.studentId,
      studentName: link.student.name,
      studentNumber: link.student.number,
      classroomName: link.student.classroom.name,
    }));
  const pendingLinks: ParentPendingLink[] = links
    .filter((link) => link.status === "pending")
    .map((link) => toParentPendingLink(link));
  const { child, error } = await searchParams;
  const initialSelectedId =
    (child && childRows.find((row) => row.studentId === child)?.studentId) ??
    childRows[0]?.studentId ??
    "";

  return (
    <>
      {error === "forbidden_student" ? (
        <div className="section-panel-notice parent-home-notice" role="status" aria-live="polite">
          해당 자녀에게 접근할 권한이 없어요. 연결된 자녀 목록에서 다시 선택해 주세요.
        </div>
      ) : null}
      <ParentHomeGrid
        children={childRows}
        initialSelectedId={initialSelectedId}
        pendingLinks={pendingLinks}
      />
    </>
  );
}
