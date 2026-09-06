import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import { canAccessSubmission } from "@/lib/assessment-permissions";

/**
 * Teacher-only manual grading endpoint.
 * Body: { questionId: string, correct: boolean }
 * Sets AssessmentAnswer.manualScore to maxScore (correct) or 0 (wrong)
 * for the MANUAL question identified by questionId under this submission.
 */
import { withProductFeature } from "@/lib/product-release-server";

export const PATCH = withProductFeature("developmentLayouts", PATCHHandler);
async function PATCHHandler(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: submissionId } = await params;
  const ids = await resolveIdentities();
  const access = await canAccessSubmission(submissionId, ids);
  if (!access.allowed || !access.asTeacher) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    questionId: string;
    correct: boolean;
  };
  if (!body?.questionId || typeof body.correct !== "boolean") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const question = await db.assessmentQuestion.findUnique({
    where: { id: body.questionId },
    select: { kind: true, maxScore: true },
  });
  if (!question) {
    return NextResponse.json({ error: "question_not_found" }, { status: 404 });
  }
  if (question.kind !== "MANUAL") {
    return NextResponse.json({ error: "not_manual" }, { status: 400 });
  }

  const answer = await db.assessmentAnswer.findUnique({
    where: {
      submissionId_questionId: { submissionId, questionId: body.questionId },
    },
  });
  if (!answer) {
    return NextResponse.json({ error: "answer_not_found" }, { status: 404 });
  }

  // Block re-grading once the gradebook entry is released.
  const entry = await db.gradebookEntry.findUnique({
    where: { submissionId },
    select: { releasedAt: true },
  });
  if (entry?.releasedAt) {
    return NextResponse.json({ error: "already_released" }, { status: 409 });
  }

  const manualScore = body.correct ? question.maxScore : 0;
  const updated = await db.assessmentAnswer.update({
    where: { id: answer.id },
    data: { manualScore },
  });
  return NextResponse.json({ answer: updated });
}
