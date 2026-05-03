import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBoardRole } from "@/lib/rbac";

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ sectionId: string; membershipId: string }> }
) {
  try {
    const { sectionId, membershipId } = await ctx.params;
    const user = await getCurrentUser().catch(() => null);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const section = await db.section.findUnique({ where: { id: sectionId }, select: { boardId: true } });
    if (!section) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const role = await getBoardRole(section.boardId, user.id);
    if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    await db.breakoutMembership.delete({ where: { id: membershipId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE membership]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
