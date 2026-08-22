import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import {
  CONTENT_TARGET_KINDS,
  FEED_CONTENT_TARGET_KINDS,
  canActOnContent,
} from "@/lib/content-safety";
import {
  hideTarget,
  hideAuthor,
  resolveReportTarget,
  unhideAuthor,
  unhideTarget,
} from "@/lib/content-safety-service";

// Per-student content hiding (App Store guideline 1.2, 2026-07-25).
//
// Hiding is a private preference: it never changes what other students, the
// teacher, or guardians see. The primary path is a single item; the author-level
// hide is created by the report flow and can only be removed here.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HideSchema = z.object({
  targetKind: z.enum([...CONTENT_TARGET_KINDS, ...FEED_CONTENT_TARGET_KINDS] as [string, ...string[]]),
  targetId: z.string().trim().min(1).max(100),
});

const HideAuthorSchema = z.object({
  scope: z.literal("author"),
  hiddenStudentId: z.string().trim().min(1).max(100),
});

const UnhideSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("target"),
    targetKind: z.enum([...CONTENT_TARGET_KINDS, ...FEED_CONTENT_TARGET_KINDS] as [string, ...string[]]),
    targetId: z.string().trim().min(1).max(100),
  }),
  z.object({
    scope: z.literal("author"),
    hiddenStudentId: z.string().trim().min(1).max(100),
  }),
]);

/** Everything the student has hidden, for the "숨긴 항목" settings screen. */
export async function GET() {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [targets, feedTargets, authors] = await Promise.all([
    db.hiddenContent.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      select: { targetKind: true, targetId: true, viaReport: true, createdAt: true },
    }),
    db.feedHiddenContent.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      select: { targetKind: true, targetId: true, viaReport: true, createdAt: true },
    }),
    db.hiddenContentAuthor.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      select: {
        hiddenStudentId: true,
        createdAt: true,
        hiddenStudent: { select: { name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    items: [
      ...targets.map((row) => ({
      targetKind: row.targetKind,
      targetId: row.targetId,
      viaReport: row.viaReport,
      createdAt: row.createdAt.toISOString(),
      })),
      ...feedTargets.map((row) => ({
        targetKind: row.targetKind,
        targetId: row.targetId,
        viaReport: row.viaReport,
        createdAt: row.createdAt.toISOString(),
      })),
    ],
    authors: authors.map((row) => ({
      studentId: row.hiddenStudentId,
      name: row.hiddenStudent.name,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}

/** Hide one card or comment for the current student only. */
export async function POST(req: Request) {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const authorParsed = HideAuthorSchema.safeParse(body);
  if (authorParsed.success) {
    if (authorParsed.data.hiddenStudentId === student.id) {
      return NextResponse.json({ error: "self_hide_forbidden" }, { status: 400 });
    }
    const targetStudent = await db.student.findFirst({
      where: { id: authorParsed.data.hiddenStudentId, classroomId: student.classroomId },
      select: { id: true },
    });
    if (!targetStudent) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await hideAuthor({ studentId: student.id, hiddenStudentId: targetStudent.id });
    return NextResponse.json({ ok: true });
  }
  const parsed = HideSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { targetKind, targetId } = parsed.data;

  // Reuse the report target resolver for its classroom scoping, so a student
  // cannot create hide rows referencing another classroom's content.
  const target = await resolveReportTarget({
    targetKind,
    targetId,
    reporterClassroomId: student.classroomId,
  });
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!canActOnContent(student.id, target.authorStudentId)) {
    return NextResponse.json({ error: "self_hide_forbidden" }, { status: 400 });
  }

  await hideTarget({ studentId: student.id, targetKind, targetId });
  return NextResponse.json({ ok: true });
}

/** Undo a hide, either for one item or for a whole author. */
export async function DELETE(req: Request) {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = UnhideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  if (parsed.data.scope === "author") {
    await unhideAuthor({ studentId: student.id, hiddenStudentId: parsed.data.hiddenStudentId });
    return NextResponse.json({ ok: true });
  }

  await unhideTarget({
    studentId: student.id,
    targetKind: parsed.data.targetKind,
    targetId: parsed.data.targetId,
  });
  return NextResponse.json({ ok: true });
}
