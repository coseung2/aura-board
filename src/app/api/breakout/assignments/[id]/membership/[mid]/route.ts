/**
 * PATCH / DELETE /api/breakout/assignments/[id]/membership/[mid] (BR-5)
 *
 * Owner-only. Move a student to another section, or remove them entirely.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBoardRole, ForbiddenError } from "@/lib/rbac";

const Patch = z.object({
  sectionId: z.string().min(1),
  force: z.boolean().optional(),
});

async function requireOwner(assignmentId: string, userId: string) {
  const assignment = await db.breakoutAssignment.findUnique({
    where: { id: assignmentId },
  });
  if (!assignment) throw new Error("not_found");
  const role = await getBoardRole(assignment.boardId, userId);
  if (role !== "owner") throw new ForbiddenError("owner-only");
  return assignment;
}

import { withProductFeature } from "@/lib/product-release-server";

export const PATCH = withProductFeature("developmentLayouts", PATCHHandler);
async function PATCHHandler(
  req: Request,
  ctx: { params: Promise<{ id: string; mid: string }> }
) {
  try {
    const { id, mid } = await ctx.params;
    const user = await getCurrentUser();
    const assignment = await requireOwner(id, user.id);

    const body = await req.json();
    const input = Patch.parse(body);

    const section = await db.section.findUnique({
      where: { id: input.sectionId },
      select: { boardId: true },
    });
    if (!section || section.boardId !== assignment.boardId) {
      return NextResponse.json({ error: "section_mismatch" }, { status: 400 });
    }

    if (!input.force) {
      const count = await db.breakoutMembership.count({
        where: { assignmentId: id, sectionId: input.sectionId },
      });
      if (count >= assignment.groupCapacity) {
        return NextResponse.json({ error: "capacity_reached" }, { status: 400 });
      }
    }

    try {
      const updated = await db.breakoutMembership.update({
        where: { id: mid },
        data: { sectionId: input.sectionId },
      });
      return NextResponse.json({ membership: updated });
    } catch {
      return NextResponse.json({ error: "update_failed" }, { status: 409 });
    }
  } catch (e) {
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof Error && e.message === "not_found")
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    console.error("[PATCH membership]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export const DELETE = withProductFeature("developmentLayouts", DELETEHandler);
async function DELETEHandler(
  _req: Request,
  ctx: { params: Promise<{ id: string; mid: string }> }
) {
  try {
    const { id, mid } = await ctx.params;
    const user = await getCurrentUser();
    await requireOwner(id, user.id);
    await db.breakoutMembership.delete({ where: { id: mid } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof Error && e.message === "not_found")
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    console.error("[DELETE membership]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
