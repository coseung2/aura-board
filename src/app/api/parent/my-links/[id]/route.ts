import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withParentAuth } from "@/lib/parent-auth-only";
import { canTransition } from "@/lib/parent-link-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  return withParentAuth(req, async ({ parent }) => {
    const { id } = await ctx.params;
    const link = await db.parentChildLink.findFirst({
      where: { id, parentId: parent.id, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!link) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (link.status === "pending") {
      if (!canTransition(link.status, "rejected")) {
        return NextResponse.json({ error: "state_conflict" }, { status: 409 });
      }
      const now = new Date();
      await db.parentChildLink.update({
        where: { id: link.id },
        data: {
          status: "rejected",
          rejectedAt: now,
          rejectedReason: "other",
          deletedAt: now,
        },
      });
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    if (link.status === "active") {
      if (!canTransition(link.status, "revoked")) {
        return NextResponse.json({ error: "state_conflict" }, { status: 409 });
      }
      const now = new Date();
      await db.parentChildLink.update({
        where: { id: link.id },
        data: {
          status: "revoked",
          revokedAt: now,
          revokedReason: "parent_self_leave",
          deletedAt: now,
        },
      });
      return NextResponse.json({ ok: true, status: "revoked" });
    }

    return NextResponse.json({ ok: true, alreadyRemoved: true });
  });
}
