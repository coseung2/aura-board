import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateUniqueCode } from "@/lib/class-invite-codes";

// parent-class-invite-v2 — GET list + POST create class invite codes.
// Auth: teacher NextAuth session + classroom ownership. api_contract.json §2.1.

async function requireClassroomOwnership(classroomId: string, userId: string) {
  const classroom = await db.classroom.findUnique({ where: { id: classroomId } });
  if (!classroom) return null;
  if (classroom.teacherId !== userId) return null;
  return classroom;
}

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    const url = new URL(req.url);
    const classroomId = url.searchParams.get("classroomId");
    if (!classroomId) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    if (!(await requireClassroomOwnership(classroomId, user.id))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const rows = await db.classInviteCode.findMany({
      where: { classroomId },
      orderBy: { createdAt: "desc" },
    });
    const active = rows.find((r) => r.rotatedAt === null) ?? null;
    const history = rows.filter((r) => r.rotatedAt !== null);
    return NextResponse.json({
      active: active
        ? {
            id: active.id,
            code: active.code,
            classroomId: active.classroomId,
            expiresAt: active.expiresAt?.toISOString() ?? null,
            createdAt: active.createdAt.toISOString(),
          }
        : null,
      history: history.map((h) => ({
        id: h.id,
        code: h.code,
        createdAt: h.createdAt.toISOString(),
        rotatedAt: h.rotatedAt?.toISOString() ?? null,
      })),
    });
  } catch (e) {
    console.error("[GET /api/class-invite-codes]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

const CreateSchema = z.object({ classroomId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    const body = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const { classroomId } = parsed.data;
    if (!(await requireClassroomOwnership(classroomId, user.id))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const existingActive = await db.classInviteCode.findFirst({
      where: { classroomId, rotatedAt: null },
    });
    if (existingActive) {
      return NextResponse.json(
        { error: "already_exists", activeCodeId: existingActive.id },
        { status: 409 }
      );
    }
    const { code, codeHash } = await generateUniqueCode(async (hash) =>
      Boolean(await db.classInviteCode.findUnique({ where: { codeHash: hash } }))
    );
    const created = await db.classInviteCode.create({
      data: {
        classroomId,
        code,
        codeHash,
        issuedById: user.id,
      },
    });
    return NextResponse.json({
      id: created.id,
      code: created.code,
      classroomId: created.classroomId,
      expiresAt: null,
      createdAt: created.createdAt.toISOString(),
    });
  } catch (e) {
    console.error("[POST /api/class-invite-codes]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
