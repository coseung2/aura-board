import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// Teacher moderation queue for student reports (App Store guideline 1.2).
//
// The App Store commitment is to act on reports within 24 hours, so this queue
// is ordered oldest-pending-first and exposes the two actions a teacher needs:
// delete the content, or dismiss the report.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const StatusSchema = z.enum(["pending", "actioned", "dismissed", "all"]);

const ResolveSchema = z.object({
  reportId: z.string().trim().min(1).max(100),
  // "remove" deletes the reported content; "dismiss" leaves it in place.
  action: z.enum(["remove", "dismiss"]),
});

/** Confirm the caller is the classroom's teacher. */
async function authorizeTeacher(classroomId: string) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return { ok: false as const, status: 401, error: "unauthorized" };
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { teacherId: true },
  });
  if (!classroom) return { ok: false as const, status: 404, error: "not_found" };
  if (classroom.teacherId !== user.id) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }
  return { ok: true as const, userId: user.id };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;
  const auth = await authorizeTeacher(classroomId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const statusResult = StatusSchema.safeParse(
    new URL(req.url).searchParams.get("status") ?? "pending",
  );
  if (!statusResult.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const status = statusResult.data;

  const rows = await db.contentReport.findMany({
    where: { classroomId, ...(status === "all" ? {} : { status }) },
    // Oldest pending first: the 24-hour commitment is per report.
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 100,
    select: {
      id: true,
      targetKind: true,
      targetId: true,
      reason: true,
      detail: true,
      contentSnapshot: true,
      authorLabel: true,
      authorStudentId: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      reporter: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    items: rows.map((row) => ({
      id: row.id,
      targetKind: row.targetKind,
      targetId: row.targetId,
      reason: row.reason,
      detail: row.detail,
      contentSnapshot: row.contentSnapshot,
      authorLabel: row.authorLabel,
      authorStudentId: row.authorStudentId,
      reporterName: row.reporter.name,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    })),
  });
}

/** Resolve one report by removing the content or dismissing the report. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;
  const auth = await authorizeTeacher(classroomId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = ResolveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const report = await db.contentReport.findFirst({
    where: { id: parsed.data.reportId, classroomId },
    select: { id: true, targetKind: true, targetId: true },
  });
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await db.$transaction(async (tx) => {
    if (parsed.data.action === "remove") {
      if (report.targetKind === "comment") {
        const comment = await tx.cardComment.findUnique({
          where: { id: report.targetId },
          select: { parentCommentId: true },
        });
        const rootCommentId = comment?.parentCommentId ?? report.targetId;
        // Soft delete the root and every direct reply in the same moderation action.
        await tx.cardComment.updateMany({
          where: {
            OR: [{ id: rootCommentId }, { parentCommentId: rootCommentId }],
            deletedAt: null,
          },
          data: { deletedAt: new Date() },
        });
      } else {
        await tx.card.deleteMany({ where: { id: report.targetId } });
      }
    }

    await tx.contentReport.update({
      where: { id: report.id },
      data: {
        status: parsed.data.action === "remove" ? "actioned" : "dismissed",
        resolvedAt: new Date(),
        resolvedByUserId: auth.userId,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
