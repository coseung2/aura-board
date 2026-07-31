import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withParentAuth } from "@/lib/parent-auth-only";
import { readTicket } from "@/lib/match-ticket";

// parent-class-invite-v2 — GET /api/parent/match/students?ticket=...
// Returns classroom roster (id, classNo, studentNo, name). Name is the
// original — masking was removed (phase9_user_review/decisions.md #1).
// PII minimisation: explicit select only.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return withParentAuth(req, async (ctx) => {
    const url = new URL(req.url);
    const ticket = url.searchParams.get("ticket");
    if (!ticket) {
      return NextResponse.json({ error: "invalid_ticket" }, { status: 400 });
    }
    const t = await readTicket(ticket, ctx.session.id);
    if (!t) {
      return NextResponse.json({ error: "invalid_ticket" }, { status: 400 });
    }

    const classroom = await db.classroom.findUnique({
      where: { id: t.classroomId },
      select: {
        id: true,
        name: true,
        students: {
          orderBy: [{ number: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            number: true,
          },
        },
      },
    });
    if (!classroom) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // classNo is derived from classroom.name convention "3학년 2반" — UI also
    // displays it. For v1 we expose studentNo as Student.number, classNo as
    // null-safe fallback to 0 when Student.number is unset. Grade/class split
    // is not stored as structured columns; the page renders the classroom name
    // header separately.
    return NextResponse.json({
      classroomName: classroom.name,
      students: classroom.students.map((s, idx) => ({
        id: s.id,
        classNo: 0,
        studentNo: s.number ?? idx + 1,
        name: s.name,
      })),
    });
  });
}
