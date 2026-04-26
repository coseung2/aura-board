import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// teacher-notifications (2026-04-26) — GET /api/teacher/notifications
// Aggregates pending parent approval requests across ALL classrooms owned
// by the current teacher. Drives the bell icon + dropdown in the global
// TopNav so the teacher sees new approval requests without opening a
// specific classroom's parent-access page first.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const links = await db.parentChildLink.findMany({
    where: {
      status: "pending",
      deletedAt: null,
      student: { classroom: { teacherId: user.id } },
    },
    orderBy: { requestedAt: "desc" },
    take: 20,
    include: {
      parent: { select: { email: true, name: true } },
      student: {
        select: {
          id: true,
          name: true,
          classroom: { select: { id: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json({
    total: links.length,
    items: links.map((l) => ({
      linkId: l.id,
      studentName: l.student.name,
      classroomId: l.student.classroom.id,
      classroomName: l.student.classroom.name,
      parentEmail: l.parent.email,
      parentName: l.parent.name,
      requestedAt: l.requestedAt.toISOString(),
    })),
  });
}
