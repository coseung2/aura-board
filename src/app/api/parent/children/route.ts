import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withParentScope } from "@/lib/parent-scope";

const PENDING_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// mobile-phase-2 (2026-06-14) — production replacement for
// /api/parent/test/children. Returns the authenticated parent's active
// children joined through to Student + Classroom. Mobile uses this for the
// "select a child" landing page; the test endpoint is retained for PV-9+ QA
// curls but is no longer a documented surface.
//
// Auth: parent session (cookie OR `Authorization: Bearer <token>`).
// `withParentScope` already filters to status='active' + deletedAt IS NULL
// (see parent-scope.ts), so we only need to load the joined row.
//
// Response shape — keep PII minimal:
//   {
//     parent: { id, name, email },      // minimal mobile profile cache
//     children: [{
//       id,                            // ParentChildLink.id (stable selector)
//       studentId,                     // Student.id (for /api/parent/children/[id]/posts)
//       number,                        // Student.number (출석번호, nullable)
//       name,                          // Student.name
//       classroom: { id, name },
//       linkedAt,                      // ISO
//     }]
//   }
//
// Parent identity is echoed back so the mobile app can refresh its local
// greeting cache from a real authenticated endpoint. The server has already
// authenticated the request via withParentScope; we never echo tier/admin data.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return withParentScope(req, async (ctx) => {
    const pendingRows = await db.parentChildLink.findMany({
      where: {
        parentId: ctx.parent.id,
        status: "pending",
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
      include: {
        student: {
          select: {
            id: true,
            number: true,
            name: true,
            classroom: { select: { id: true, name: true } },
          },
        },
      },
    });
    const pendingLinks = pendingRows.map((l) => ({
      id: l.id,
      studentId: l.student.id,
      number: l.student.number,
      name: l.student.name,
      classroom: l.student.classroom,
      requestedAt: l.requestedAt.toISOString(),
      expiresAt: new Date(l.requestedAt.getTime() + PENDING_LINK_TTL_MS).toISOString(),
    }));

    const studentIds = ctx.childLinks.map((l) => l.studentId);
    if (studentIds.length === 0) {
      return NextResponse.json({
        parent: {
          id: ctx.parent.id,
          name: ctx.parent.name,
          email: ctx.parent.email,
        },
        children: [],
        pendingLinks,
      });
    }

    const students = await db.student.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        number: true,
        name: true,
        classroom: { select: { id: true, name: true } },
      },
    });

    // Preserve withParentScope's createdAt-asc ordering when stitching back
    // to the link row. The map size is bounded by the number of active
    // links for a single parent, so O(n) lookup is fine.
    const byId = new Map(students.map((s) => [s.id, s]));
    const children = ctx.childLinks
      .map((l) => {
        const s = byId.get(l.studentId);
        if (!s) return null; // link row references a deleted Student — skip
        return {
          id: l.id,
          studentId: s.id,
          number: s.number,
          name: s.name,
          classroom: s.classroom,
          linkedAt: l.createdAt.toISOString(),
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return NextResponse.json({
      parent: {
        id: ctx.parent.id,
        name: ctx.parent.name,
        // Parent.email is nullable in Prisma; mobile DTO keeps the same shape.
        email: ctx.parent.email,
      },
      children,
      pendingLinks,
    });
  });
}
