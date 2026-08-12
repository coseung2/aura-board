import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withParentAuth } from "@/lib/parent-auth-only";
import { clearParentSession } from "@/lib/parent-session";

// Parent-initiated permanent account deletion.
//
// POST /api/parent/account/withdraw
//
// Existing comments keep their text while their author relation is detached.
// The Parent row and every directly linked identity/session record are then
// removed in the same transaction.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withParentAuth(req, async (ctx) => {
    const now = new Date();
    const parentId = ctx.parent.id;
    const parentEmail = ctx.parent.email;

    await db.$transaction(async (tx) => {
      await tx.cardComment.updateMany({
        where: { authorParentId: parentId },
        data: { authorParentId: null },
      });
      await tx.cardCommentLike.deleteMany({ where: { likerParentId: parentId } });
      await tx.cardLike.deleteMany({ where: { likerParentId: parentId } });
      await tx.parentInviteCode.updateMany({
        where: { boundToEmail: parentEmail },
        data: { boundToEmail: null },
      });
      const matchingTeacher = await tx.user.findUnique({
        where: { email: parentEmail },
        select: { id: true },
      });
      if (!matchingTeacher) {
        await tx.passwordCredential.deleteMany({
          where: { principalEmail: parentEmail },
        });
      }
      await tx.parent.delete({ where: { id: parentId } });
    });
    await clearParentSession();
    return NextResponse.json(
      { ok: true, deletedAt: now.toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
