import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

/**
 * Saved seating layouts (2026-07-27). A teacher can keep several named
 * arrangements and restore one into the editor. This is separate from
 * ClassroomDefaultGroup, which stays the single "current" grouping that boards
 * and breakout activities read.
 */
const GroupsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(80),
      studentIds: z.array(z.string().min(1)),
    }),
  )
  .min(1);

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  groups: GroupsSchema,
});

async function requireClassroom(id: string, userId: string) {
  const classroom = await db.classroom.findUnique({
    where: { id },
    select: { id: true, teacherId: true },
  });
  if (!classroom || classroom.teacherId !== userId) return null;
  return classroom;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { id } = await params;
  if (!(await requireClassroom(id, user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const layouts = await db.classroomSeatingLayout.findMany({
    where: { classroomId: id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, groups: true, updatedAt: true },
  });

  return NextResponse.json({ layouts });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { id } = await params;
  if (!(await requireClassroom(id, user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "이름과 자리 배치를 확인해 주세요." },
      { status: 400 },
    );
  }

  const name = parsed.data.name.trim();
  // Same name overwrites, so re-saving a layout updates it in place.
  const layout = await db.classroomSeatingLayout.upsert({
    where: { classroomId_name: { classroomId: id, name } },
    create: { classroomId: id, name, groups: parsed.data.groups },
    update: { groups: parsed.data.groups },
    select: { id: true, name: true, groups: true, updatedAt: true },
  });

  return NextResponse.json({ layout }, { status: 201 });
}
