import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

const RenameSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function requireOwnedLayout(classroomId: string, layoutId: string) {
  return db.classroomSeatingLayout.findFirst({
    where: { id: layoutId, classroomId },
    select: { id: true },
  });
}

export async function PATCH(
  req: Request,
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

  const layout = await requireOwnedLayout(id, layoutId);
  if (!layout) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = RenameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "이름을 확인해 주세요." },
      { status: 400 },
    );
  }

  try {
    const renamed = await db.classroomSeatingLayout.update({
      where: { id: layoutId },
      data: { name: parsed.data.name },
      select: { id: true, name: true, groups: true, updatedAt: true },
    });
    return NextResponse.json({ layout: renamed });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "name_conflict" }, { status: 409 });
    }
    throw error;
  }
}

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
