import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

// DELETE /api/classroom/:id/seating-layouts/:layoutId
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; layoutId: string }> },
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { id, layoutId } = await params;

  const classroom = await db.classroom.findUnique({
    where: { id },
    select: { teacherId: true },
  });
  if (!classroom || classroom.teacherId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Scope the delete by classroom so a layout id from another class can't be
  // removed by guessing.
  const result = await db.classroomSeatingLayout.deleteMany({
    where: { id: layoutId, classroomId: id },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
