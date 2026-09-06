/**
 * PATCH /api/breakout/assignments/[id] (BR-5 + BR-9)
 *
 * Owner-only mutation of runtime fields:
 *   - deployMode      "link-fixed" | "self-select" | "teacher-assign"
 *   - visibilityOverride  "own-only" | "peek-others" | null
 *   - groupCapacity   1..6
 *   - status          "active" | "archived"
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import {
  BreakoutDeployModeSchema,
  BreakoutVisibilitySchema,
} from "@/lib/breakout";

const Body = z.object({
  deployMode: BreakoutDeployModeSchema.optional(),
  visibilityOverride: BreakoutVisibilitySchema.nullable().optional(),
  groupCapacity: z.number().int().min(1).max(6).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

import { withProductFeature } from "@/lib/product-release-server";

export const PATCH = withProductFeature("developmentLayouts", PATCHHandler);
async function PATCHHandler(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const user = await getCurrentUser();

    const assignment = await db.breakoutAssignment.findUnique({ where: { id } });
    if (!assignment) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const role = await requirePermission(assignment.boardId, user.id, "edit");
    if (role !== "owner") {
      throw new ForbiddenError("owner-only");
    }

    const body = await req.json();
    const input = Body.parse(body);

    const updated = await db.breakoutAssignment.update({
      where: { id },
      data: input,
    });
    return NextResponse.json({ assignment: updated });
  } catch (e) {
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[PATCH /api/breakout/assignments/[id]]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
