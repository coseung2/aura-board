import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
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
    payMode: z.enum(["auto", "manual"]).optional(),
    payAnchor: z.number().int().min(1).max(31).nullable().optional(),
    /** Rename is only allowed for teacher-authored (custom:) roles. */
    labelKo: z.string().trim().min(1).max(30).optional(),
  })
  .refine(
    ({ enabled, salaryAmount, payPeriod, payMode, payAnchor, labelKo }) =>
      enabled !== undefined ||
      salaryAmount !== undefined ||
      payPeriod !== undefined ||
      payMode !== undefined ||
      payAnchor !== undefined ||
      labelKo !== undefined,
    { message: "No role setting supplied" },
  );

const CreateRoleBody = z.object({
  labelKo: z.string().trim().min(1).max(30),
  salaryAmount: z.number().int().nonnegative().optional(),
  payPeriod: z.enum(CLASSROOM_ROLE_PAY_PERIODS).optional(),
  payMode: z.enum(["auto", "manual"]).optional(),
  payAnchor: z.number().int().min(1).max(31).nullable().optional(),
});

/**
 * ClassroomRoleDef.key is globally unique, so teacher-authored roles are
 * namespaced per classroom. Only this classroom enables the resulting def, so
 * a custom role never leaks into another teacher's role list.
 */
function customRoleKey(classroomId: string): string {
  return `custom:${classroomId}:${randomUUID()}`;
}

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
        payMode: true,
        payAnchor: true,
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

  // Catalog roles are shared across every classroom, so only teacher-authored
  // roles (custom:<classroomId>:...) may be renamed, and only by their owner.
  if (parsed.data.labelKo !== undefined) {
    if (!parsed.data.roleKey.startsWith(`custom:${classroomId}:`)) {
      return NextResponse.json(
        { error: "기본 역할의 이름은 변경할 수 없습니다." },
        { status: 403 },
      );
    }
    await db.classroomRoleDef.update({
      where: { id: role.id },
      data: { labelKo: parsed.data.labelKo },
    });

    const renameOnly =
      parsed.data.enabled === undefined &&
      parsed.data.salaryAmount === undefined &&
      parsed.data.payPeriod === undefined &&
      parsed.data.payMode === undefined &&
      parsed.data.payAnchor === undefined;
    if (renameOnly) {
      return NextResponse.json({
        roleKey: parsed.data.roleKey,
        labelKo: parsed.data.labelKo,
      });
    }
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
        payMode: parsed.data.payMode ?? "manual",
        payAnchor: parsed.data.payAnchor ?? null,
      },
      update: {
        ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
        ...(parsed.data.salaryAmount !== undefined
          ? { salaryAmount: parsed.data.salaryAmount }
          : {}),
        ...(parsed.data.payPeriod !== undefined ? { payPeriod: parsed.data.payPeriod } : {}),
        ...(parsed.data.payMode !== undefined ? { payMode: parsed.data.payMode } : {}),
        ...(parsed.data.payAnchor !== undefined
          ? { payAnchor: parsed.data.payAnchor }
          : {}),
      },
      select: {
        enabled: true,
        salaryAmount: true,
        payPeriod: true,
        payMode: true,
        payAnchor: true,
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

// POST /api/classrooms/:id/roles
// Creates a teacher-authored role and enables it for this classroom only.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = CreateRoleBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "역할 이름을 확인해 주세요." },
      { status: 400 },
    );
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

  const labelKo = parsed.data.labelKo.trim();

  // Reject duplicates among the roles this classroom already has enabled.
  const [existingDefs, settings] = await Promise.all([
    db.classroomRoleDef.findMany({ select: { id: true, labelKo: true } }),
    db.classroomRoleSetting.findMany({
      where: { classroomId, enabled: true },
      select: { classroomRoleId: true },
    }),
  ]);
  const enabledIds = new Set(settings.map((setting) => setting.classroomRoleId));
  const duplicate = existingDefs.some(
    (def) => enabledIds.has(def.id) && def.labelKo === labelKo,
  );
  if (duplicate) {
    return NextResponse.json(
      { error: "이미 같은 이름의 역할이 있습니다." },
      { status: 409 },
    );
  }

  const created = await db.$transaction(async (tx) => {
    const def = await tx.classroomRoleDef.create({
      data: {
        key: customRoleKey(classroomId),
        labelKo,
        description: "",
      },
      select: { id: true, key: true, labelKo: true },
    });
    await tx.classroomRoleSetting.create({
      data: {
        classroomId,
        classroomRoleId: def.id,
        enabled: true,
        salaryAmount: parsed.data.salaryAmount ?? 0,
        payPeriod: parsed.data.payPeriod ?? "weekly",
        payMode: parsed.data.payMode ?? "manual",
        payAnchor: parsed.data.payAnchor ?? null,
      },
    });
    return def;
  });

  return NextResponse.json({ role: created }, { status: 201 });
}
