import { NextResponse } from "next/server";
import { withParentScope } from "@/lib/parent-scope";

// Smoke-test route for parentScopeMiddleware.
// Returns the authenticated parent's active children (ids + studentIds only).
// Used by PV-9+ QA curl flows to verify session + scope resolution.
// NOT a production surface — replace with a proper /api/parent/children
// endpoint in PV-6 that joins through to Student name/classroom.

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const result = await withParentScope(req, async (ctx) => {
    return NextResponse.json({
      parentId: ctx.parent.id,
      email: ctx.parent.email,
      tier: ctx.parent.tier,
      children: ctx.childLinks.map((l) => ({
        linkId: l.id,
        studentId: l.studentId,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  });
  return result;
}
