import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";

import { withProductFeature } from "@/lib/product-release-server";

export const POST = withProductFeature("developmentLayouts", POSTHandler);
async function POSTHandler(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: templateId } = await params;
  const ids = await resolveIdentities();
  if (!ids.student) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const template = await db.assessmentTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, classroomId: true, durationMin: true },
  });
  if (!template) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (template.classroomId !== ids.student.classroomId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Idempotent: re-starting returns the existing submission.
  const existing = await db.assessmentSubmission.findUnique({
    where: { templateId_studentId: { templateId, studentId: ids.student.studentId } },
  });
  if (existing) {
    return NextResponse.json({ submission: existing, serverTime: new Date().toISOString() });
  }

  const startedAt = new Date();
  const endAt = new Date(startedAt.getTime() + template.durationMin * 60_000);
  const submission = await db.assessmentSubmission.create({
    data: {
      templateId,
      studentId: ids.student.studentId,
      startedAt,
      endAt,
    },
  });
  return NextResponse.json({ submission, serverTime: startedAt.toISOString() });
}
