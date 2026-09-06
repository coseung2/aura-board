import { NextResponse } from "next/server";
import {
  ParentScopeError,
  requireParentChildLinkOwned,
  withParentScopeForStudent,
} from "@/lib/parent-scope";

// Cross-isolation smoke-test.
// - ?studentId=<id>  → exercise requireParentScopeForStudent (403 on foreign)
// - ?linkId=<id>     → exercise requireParentChildLinkOwned  (404 on foreign)
// This lets PV-9+ QA confirm AC-5 (403) and AC-6 (404) without wiring a full
// product surface. Remove or lock behind a dev flag before go-live.

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const studentId = url.searchParams.get("studentId");
  const linkId = url.searchParams.get("linkId");

  if (linkId) {
    try {
      const { link } = await requireParentChildLinkOwned(req, linkId);
      return NextResponse.json({ ok: true, link: { id: link.id, studentId: link.studentId } });
    } catch (e) {
      if (e instanceof ParentScopeError) {
        return NextResponse.json({ error: e.code }, { status: e.status });
      }
      console.error("[test/cross-isolation linkId]", e);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
  }

  if (studentId) {
    return withParentScopeForStudent(req, studentId, async (ctx) => {
      return NextResponse.json({
        ok: true,
        parentId: ctx.parent.id,
        studentId,
      });
    });
  }

  return NextResponse.json({ error: "missing_query" }, { status: 400 });
}
