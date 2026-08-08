import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { dispatchParentNotification } from "@/lib/parent-email";
import { invalidateStudentIdentityCache } from "@/lib/student-auth";

const UpdateSchema = z.object({
  name: z.string().min(1).max(100),
});

async function requireOwnership(classroomId: string, userId: string) {
  const classroom = await db.classroom.findUnique({ where: { id: classroomId } });
  if (!classroom) return null;
  if (classroom.teacherId !== userId) return null;
  return classroom;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const classroom = await db.classroom.findUnique({
      where: { id },
      include: {
        students: { orderBy: { createdAt: "asc" } },
        boards: { select: { id: true, slug: true, title: true, layout: true } },
      },
    });
    if (!classroom || classroom.teacherId !== user.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ classroom });
  } catch (e) {
    console.error("[GET /api/classroom/:id]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    if (!(await requireOwnership(id, user.id))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const input = UpdateSchema.parse(body);
    const updated = await db.classroom.update({
      where: { id },
      data: { name: input.name },
    });
    return NextResponse.json({ classroom: updated });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[PATCH /api/classroom/:id]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const classroom = await requireOwnership(id, user.id);
    if (!classroom) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Optional confirmName body (parent-class-invite-v2 AMENDMENT PV-17).
    // When the body is present we require an exact match. Empty/missing body
    // preserves the legacy one-click behaviour (backwards compat).
    let body: { confirmName?: string } = {};
    try {
      body = (await req.json()) as { confirmName?: string };
    } catch {
      // no body — proceed as legacy
    }
    if (body.confirmName !== undefined && body.confirmName !== classroom.name) {
      return NextResponse.json({ error: "confirm_mismatch" }, { status: 400 });
    }

    // Cascade revoke ParentChildLink rows. Emails are after-commit and use
    // only the classroom name (no teacher PII — architecture.md §8.4).
    const { affectedEmails } = await db.$transaction(async (tx) => {
      const cascaded = await tx.parentChildLink.findMany({
        where: {
          status: { in: ["pending", "active"] },
          student: { classroomId: id },
          deletedAt: null,
        },
        include: { parent: { select: { email: true } } },
      });
      const now = new Date();
      if (cascaded.length > 0) {
        await tx.parentChildLink.updateMany({
          where: { id: { in: cascaded.map((c) => c.id) } },
          data: {
            status: "revoked",
            revokedAt: now,
            revokedById: user.id,
            revokedReason: "classroom_deleted",
          },
        });
      }
      await tx.classroom.delete({ where: { id } });
      return { affectedEmails: cascaded.map((c) => c.parent.email) };
    });

    // The classroom cascade removed every student row. This deployment runs a
    // single application process on Oracle, so clear its bounded identity cache.
    invalidateStudentIdentityCache();

    await Promise.allSettled(
      affectedEmails.map((email) =>
        dispatchParentNotification({
          to: email,
          subject: "[Aura-board] 학급 종료 안내",
          template: "parent-classroom-deleted",
          props: { classroomName: classroom.name },
        })
      )
    );

    return NextResponse.json({ ok: true, revokedLinks: affectedEmails.length });
  } catch (e) {
    console.error("[DELETE /api/classroom/:id]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
