import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withParentAuth } from "@/lib/parent-auth-only";
import { consumeTicket } from "@/lib/match-ticket";

// parent-class-invite-v2 — POST /api/parent/match/request.
// Consumes the ticket, verifies studentId ∈ classroom, enforces ≤3 concurrent
// pending per parent, writes ParentChildLink(status=pending).

const Schema = z.object({
  ticket: z.string().min(1),
  studentId: z.string().min(1),
});
const MAX_PENDING_PER_PARENT = 3;

export async function POST(req: Request) {
  return withParentAuth(req, async (ctx) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const t = await consumeTicket(parsed.data.ticket, ctx.session.id);
    if (!t) {
      return NextResponse.json({ error: "invalid_ticket" }, { status: 400 });
    }

    // Student must be in the ticket's classroom (no cross-classroom abuse).
    const student = await db.student.findUnique({
      where: { id: parsed.data.studentId },
      select: { id: true, classroomId: true },
    });
    if (!student || student.classroomId !== t.classroomId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const pendingCount = await db.parentChildLink.count({
      where: { parentId: ctx.parent.id, status: "pending", deletedAt: null },
    });
    if (pendingCount >= MAX_PENDING_PER_PARENT) {
      return NextResponse.json({ error: "too_many_pending" }, { status: 429 });
    }

    try {
      const link = await db.parentChildLink.upsert({
        where: {
          parentId_studentId: { parentId: ctx.parent.id, studentId: student.id },
        },
        update: {
          // If previously rejected/revoked/soft-deleted, reset for new attempt.
          status: "pending",
          requestedAt: new Date(),
          approvedAt: null,
          approvedById: null,
          rejectedAt: null,
          rejectedById: null,
          rejectedReason: null,
          revokedAt: null,
          revokedById: null,
          revokedReason: null,
          deletedAt: null,
        },
        create: {
          parentId: ctx.parent.id,
          studentId: student.id,
          status: "pending",
        },
      });
      return NextResponse.json({ linkId: link.id, status: link.status });
    } catch (e) {
      console.error("[POST /api/parent/match/request]", e);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
  });
}
