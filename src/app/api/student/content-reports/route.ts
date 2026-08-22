import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  getCurrentStudent,
  invalidateStudentIdentityCache,
} from "@/lib/student-auth";
import {
  CONTENT_REPORT_REASONS,
  CONTENT_TARGET_KINDS,
  FEED_CONTENT_TARGET_KINDS,
  canActOnContent,
  normalizeReportDetail,
  REPORT_DETAIL_MAX_LENGTH,
} from "@/lib/content-safety";
import { resolveReportTarget } from "@/lib/content-safety-service";

// Student-filed content reports (App Store guideline 1.2, 2026-07-25).
//
// Filing a report does three things atomically from the student's point of
// view: it queues the item for the teacher, it hides the item for the reporter
// immediately (Apple requires instant removal from the reporter's feed), and it
// optionally hides everything from that author when the student opts in.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CreateSchema = z.object({
  targetKind: z.enum([...CONTENT_TARGET_KINDS, ...FEED_CONTENT_TARGET_KINDS] as [string, ...string[]]),
  targetId: z.string().trim().min(1).max(100),
  reason: z.enum(CONTENT_REPORT_REASONS),
  detail: z.string().trim().max(REPORT_DETAIL_MAX_LENGTH).optional(),
  // Opt-in author-level hide, offered on the report completion step.
  hideAuthor: z.boolean().optional(),
});

export async function POST(req: Request) {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { targetKind, targetId, reason } = parsed.data;

  const target = await resolveReportTarget({
    targetKind,
    targetId,
    reporterClassroomId: student.classroomId,
  });
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!canActOnContent(student.id, target.authorStudentId)) {
    return NextResponse.json({ error: "self_report_forbidden" }, { status: 400 });
  }

  const detail = normalizeReportDetail(reason, parsed.data.detail);

  const shouldHideAuthor = Boolean(parsed.data.hideAuthor) && Boolean(target.authorStudentId);
  // Re-reporting the same item refreshes the reason and re-opens the queue
  // entry rather than creating a duplicate for the teacher to triage. The
  // report and both hide records must commit or roll back together.
  const report = await db.$transaction(async (tx) => {
    if (targetKind === "feed_post" || targetKind === "feed_comment") {
      const createdReport = await tx.feedContentReport.upsert({
        where: {
          reporterStudentId_targetKind_targetId: {
            reporterStudentId: student.id,
            targetKind,
            targetId,
          },
        },
        update: {
          reason,
          detail,
          contentSnapshot: target.contentSnapshot,
          authorStudentId: target.authorStudentId,
          authorLabel: target.authorLabel,
          status: "pending",
          resolvedAt: null,
          resolvedByUserId: null,
        },
        create: {
          classroomId: target.classroomId,
          targetKind,
          targetId,
          reporterStudentId: student.id,
          authorStudentId: target.authorStudentId,
          authorLabel: target.authorLabel,
          reason,
          detail,
          contentSnapshot: target.contentSnapshot,
        },
        select: { id: true },
      });
      await tx.feedHiddenContent.upsert({
        where: { studentId_targetKind_targetId: { studentId: student.id, targetKind, targetId } },
        update: { viaReport: true },
        create: { studentId: student.id, targetKind, targetId, viaReport: true },
      });
      if (shouldHideAuthor && target.authorStudentId) {
        await tx.hiddenContentAuthor.upsert({
          where: { studentId_hiddenStudentId: { studentId: student.id, hiddenStudentId: target.authorStudentId } },
          update: { reportId: null },
          create: { studentId: student.id, hiddenStudentId: target.authorStudentId, reportId: null },
        });
      }
      return createdReport;
    }
    const createdReport = await tx.contentReport.upsert({
      where: {
        reporterStudentId_targetKind_targetId: {
          reporterStudentId: student.id,
          targetKind,
          targetId,
        },
      },
      update: {
        reason,
        detail,
        contentSnapshot: target.contentSnapshot,
        authorStudentId: target.authorStudentId,
        authorLabel: target.authorLabel,
        status: "pending",
        resolvedAt: null,
        resolvedByUserId: null,
      },
      create: {
        classroomId: target.classroomId,
        targetKind,
        targetId,
        reporterStudentId: student.id,
        authorStudentId: target.authorStudentId,
        authorLabel: target.authorLabel,
        reason,
        detail,
        contentSnapshot: target.contentSnapshot,
      },
      select: { id: true },
    });

    await tx.hiddenContent.upsert({
      where: { studentId_targetKind_targetId: { studentId: student.id, targetKind, targetId } },
      update: { viaReport: true },
      create: { studentId: student.id, targetKind, targetId, viaReport: true },
    });

    if (shouldHideAuthor && target.authorStudentId) {
      await tx.hiddenContentAuthor.upsert({
        where: {
          studentId_hiddenStudentId: {
            studentId: student.id,
            hiddenStudentId: target.authorStudentId,
          },
        },
        update: { reportId: createdReport.id },
        create: {
          studentId: student.id,
          hiddenStudentId: target.authorStudentId,
          reportId: createdReport.id,
        },
      });
    }

    return createdReport;
  });

  invalidateStudentIdentityCache(student.id);

  return NextResponse.json({
    ok: true,
    reportId: report.id,
    hiddenTarget: true,
    hiddenAuthor: shouldHideAuthor,
    // Null when the item has no student author, which is why the client must
    // not offer the author-level hide for those items.
    authorStudentId: target.authorStudentId,
    authorLabel: target.authorLabel,
  });
}
