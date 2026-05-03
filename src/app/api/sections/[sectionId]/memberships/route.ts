import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBoardRole } from "@/lib/rbac";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sectionId } = await ctx.params;
    const user = await getCurrentUser().catch(() => null);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const section = await db.section.findUnique({ where: { id: sectionId }, select: { boardId: true } });
    if (!section) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const role = await getBoardRole(section.boardId, user.id);
    if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const memberships = await db.breakoutMembership.findMany({
      where: { sectionId },
      include: { student: { select: { id: true, name: true, number: true } } },
      orderBy: { joinedAt: "asc" },
    });

    return NextResponse.json({
      memberships: memberships.map((m) => ({
        id: m.id,
        studentId: m.studentId,
        studentName: m.student.name,
        studentNumber: m.student.number,
      })),
    });
  } catch (e) {
    console.error("[GET memberships]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sectionId } = await ctx.params;
    const user = await getCurrentUser().catch(() => null);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const section = await db.section.findUnique({ where: { id: sectionId }, select: { boardId: true } });
    if (!section) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const role = await getBoardRole(section.boardId, user.id);
    if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { studentId } = body;
    if (!studentId || typeof studentId !== "string") {
      return NextResponse.json({ error: "studentId required" }, { status: 400 });
    }

    const existing = await db.breakoutMembership.findUnique({
      where: { sectionId_studentId: { sectionId, studentId } },
    });
    if (existing) {
      return NextResponse.json({ error: "already_assigned" }, { status: 409 });
    }

    const membership = await db.breakoutMembership.create({
      data: { sectionId, studentId },
      include: { student: { select: { id: true, name: true, number: true } } },
    });

    return NextResponse.json({
      membership: {
        id: membership.id,
        studentId: membership.studentId,
        studentName: membership.student.name,
        studentNumber: membership.student.number,
      },
    });
  } catch (e) {
    console.error("[POST membership]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
