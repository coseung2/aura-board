import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";
import {
  CLASSROOM_ROLE_PAY_PERIODS,
  resolveClassroomRoleSetting,
} from "@/lib/classroom-role-settings";

const UpdateRoleBody = z
  .object({
    roleKey: z.string().min(1),
    enabled: z.boolean().optional(),
    salaryAmount: z.number().int().nonnegative().optional(),
    payPeriod: z.enum(CLASSROOM_ROLE_PAY_PERIODS).optional(),
  })
  .refine(
    ({ enabled, salaryAmount, payPeriod }) =>
      enabled !== undefined || salaryAmount !== undefined || payPeriod !== undefined,
    { message: "No role setting supplied" },
  );

// GET /api/classrooms/:id/roles
// Returns role definitions + current assignments for the classroom.
// Teacher-only (classroom.teacherId === user.id).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: classroomId } = await params;

  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { id: true, teacherId: true },
  });
  if (!classroom) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (classroom.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [availableDefs, assignments, settings] = await Promise.all([
    db.classroomRoleDef.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        key: true,
        labelKo: true,
        emoji: true,
        description: true,
      },
    }),
    db.classroomRoleAssignment.findMany({
      where: { classroomId },
      orderBy: { assignedAt: "desc" },
      select: {
        id: true,
        studentId: true,
        classroomRoleId: true,
        assignedAt: true,
        student: { select: { id: true, name: true, number: true } },
      },
    }),
    db.classroomRoleSetting.findMany({
      where: { classroomId },
      select: {
        classroomRoleId: true,
        enabled: true,
        salaryAmount: true,
        payPeriod: true,
      },
    }),
  ]);

  const defs = availableDefs.flatMap((def) => {
    const setting = resolveClassroomRoleSetting(def.id, settings);
    return setting.enabled ? [{ ...def, ...setting }] : [];
  });
  const enabledRoleIds = new Set(defs.map((def) => def.id));

  return NextResponse.json({
    defs,
    assignments: assignments.filter((assignment) =>
      enabledRoleIds.has(assignment.classroomRoleId),
    ),
    availableDefs,
  });
}

// PATCH /api/classrooms/:id/roles
// Enables/disables a catalog role or updates compensation for an active role.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateRoleBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid role settings" }, { status: 400 });
  }

  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { teacherId: true },
  });
  if (!classroom) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (classroom.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const role = await db.classroomRoleDef.findUnique({
    where: { key: parsed.data.roleKey },
    select: { id: true },
  });
  if (!role) {
    return NextResponse.json({ error: "Unknown role" }, { status: 400 });
  }

  const existing = await db.classroomRoleSetting.findUnique({
    where: {
      classroomId_classroomRoleId: { classroomId, classroomRoleId: role.id },
    },
    select: { enabled: true },
  });
  const nextEnabled = parsed.data.enabled ?? existing?.enabled ?? true;
  if (!nextEnabled && (parsed.data.salaryAmount !== undefined || parsed.data.payPeriod)) {
    return NextResponse.json(
      { error: "Compensation requires an enabled role" },
      { status: 400 },
    );
  }

  const setting = await db.$transaction(async (tx) => {
    const saved = await tx.classroomRoleSetting.upsert({
      where: {
        classroomId_classroomRoleId: { classroomId, classroomRoleId: role.id },
      },
      create: {
        classroomId,
        classroomRoleId: role.id,
        enabled: nextEnabled,
        salaryAmount: parsed.data.salaryAmount ?? 0,
        payPeriod: parsed.data.payPeriod ?? "weekly",
      },
      update: {
        ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
        ...(parsed.data.salaryAmount !== undefined
          ? { salaryAmount: parsed.data.salaryAmount }
          : {}),
        ...(parsed.data.payPeriod !== undefined ? { payPeriod: parsed.data.payPeriod } : {}),
      },
      select: {
        enabled: true,
        salaryAmount: true,
        payPeriod: true,
      },
    });

    if (!nextEnabled) {
      await tx.classroomRoleAssignment.deleteMany({
        where: { classroomId, classroomRoleId: role.id },
      });
    }
    return saved;
  });

  return NextResponse.json({ roleKey: parsed.data.roleKey, ...setting });
}
