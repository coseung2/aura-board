import { redirect } from "next/navigation";
import { ParentFeed } from "@/components/parent/ParentFeed";
import type { ParentPendingLink } from "@/components/parent/ParentPendingLinks";
import { db } from "@/lib/db";
import { toParentPendingLink } from "@/lib/parent-pending-link";
import { getCurrentParent } from "@/lib/parent-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ParentFeedPage() {
  const current = await getCurrentParent();
  if (!current) redirect("/parent/join?error=session_required");

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
  const pendingLinks: ParentPendingLink[] = links
    .filter((link) => link.status === "pending")
    .map((link) => toParentPendingLink(link));

  return (
    <ParentFeed
      childCount={links.filter((link) => link.status === "active").length}
      pendingLinks={pendingLinks}
    />
  );
}
