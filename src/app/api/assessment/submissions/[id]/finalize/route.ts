import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import { canAccessSubmission } from "@/lib/assessment-permissions";

import { withProductFeature } from "@/lib/product-release-server";

export const POST = withProductFeature("developmentLayouts", POSTHandler);
async function POSTHandler(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: submissionId } = await params;
  const ids = await resolveIdentities();
  const access = await canAccessSubmission(submissionId, ids);
  if (!access.allowed || !access.asTeacher) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!ids.teacher) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const submission = await db.assessmentSubmission.findUnique({
    where: { id: submissionId },
    include: {
      answers: { include: { question: { select: { kind: true } } } },
    },
  });
  if (!submission) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (submission.status !== "submitted") {
    return NextResponse.json({ error: "not_submitted" }, { status: 409 });
  }

  // Block finalize until every MANUAL answer has a teacher verdict.
  const pendingManual = submission.answers.filter(
    (a) => a.question.kind === "MANUAL" && a.manualScore === null
  );
  if (pendingManual.length > 0) {
    return NextResponse.json(
      { error: "manual_pending", pendingCount: pendingManual.length },
      { status: 409 }
    );
  }

  const finalScore = submission.answers.reduce(
    (acc, a) => acc + (a.manualScore ?? a.autoScore ?? 0),
    0
  );

  const entry = await db.gradebookEntry.upsert({
    where: { submissionId },
    create: {
      submissionId,
      finalScore,
      createdById: ids.teacher.userId,
    },
    update: { finalScore },
  });
  return NextResponse.json({ entry });
}
