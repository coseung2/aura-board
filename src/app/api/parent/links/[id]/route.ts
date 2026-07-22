import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// PV-8 — teacher-initiated revoke of a ParentChildLink.
//
// DELETE /api/parent/links/[id]
//   1) Look up the link + its student + classroom.
//   2) 404 if the calling teacher does not own that classroom (same leak
//      prevention rule as /api/parent-invites/[id]).
//   3) Soft-delete the link (`deletedAt = now`).
//   4) Revoke ALL active sessions of that parent. This drives the ≤60s
//      client-side disconnect SLA (AC-7): the next fetch from the parent
//      PWA will read a revoked session → 401 → client redirects to
//      the canonical /login UI.
//
// We revoke every session (not just for this one child) because a single
// parent can have multiple children, and the scope middleware re-queries
// parent.children on every request. Revoking sessions forces the parent
// to re-authenticate, which rebuilds the child list without this student.

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const link = await db.parentChildLink.findUnique({
    where: { id },
    include: {
      student: { include: { classroom: { select: { teacherId: true } } } },
    },
  });
  if (!link) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (link.student.classroom.teacherId !== user.id) {
    // Existence non-disclosure — don't tell the caller this link belongs
    // to a different teacher's classroom.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (link.deletedAt) {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  const now = new Date();
  await db.$transaction([
    db.parentChildLink.update({
      where: { id },
      data: { deletedAt: now },
    }),
    // Revoke every active session of this parent. A parent may still have
    // other children linked — on next sign-in their scope rebuilds without
    // this student.
    db.parentSession.updateMany({
      where: { parentId: link.parentId, sessionRevokedAt: null },
      data: { sessionRevokedAt: now },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
