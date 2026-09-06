import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import type {
  McqAnswerPayload,
  ShortAnswerPayload,
  ManualAnswerPayload,
} from "@/types/assessment";

import { withProductFeature } from "@/lib/product-release-server";

export const PATCH = withProductFeature("developmentLayouts", PATCHHandler);
async function PATCHHandler(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: submissionId } = await params;
  const ids = await resolveIdentities();
  if (!ids.student) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    questionId: string;
    selectedChoiceIds?: string[];
    textAnswer?: string;
  };
  if (!body?.questionId) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!Array.isArray(body.selectedChoiceIds) && typeof body.textAnswer !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const submission = await db.assessmentSubmission.findUnique({
    where: { id: submissionId },
    select: { studentId: true, status: true, endAt: true, templateId: true },
  });
  if (!submission) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (submission.studentId !== ids.student.studentId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (submission.status === "submitted") {
    return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  }
  if (submission.endAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 409 });
  }

  // Verify the question belongs to this template AND matches the answer kind.
  const question = await db.assessmentQuestion.findUnique({
    where: { id: body.questionId },
    select: { templateId: true, kind: true },
  });
  if (!question || question.templateId !== submission.templateId) {
    return NextResponse.json({ error: "question_mismatch" }, { status: 400 });
  }

  let payload: McqAnswerPayload | ShortAnswerPayload | ManualAnswerPayload;
  if (question.kind === "MCQ") {
    if (!Array.isArray(body.selectedChoiceIds)) {
      return NextResponse.json({ error: "kind_mismatch" }, { status: 400 });
    }
    payload = { selectedChoiceIds: body.selectedChoiceIds };
  } else if (question.kind === "SHORT") {
    if (typeof body.textAnswer !== "string") {
      return NextResponse.json({ error: "kind_mismatch" }, { status: 400 });
    }
    payload = { textAnswer: body.textAnswer.replace(/\s+/g, "") };
  } else if (question.kind === "MANUAL") {
    if (typeof body.textAnswer !== "string") {
      return NextResponse.json({ error: "kind_mismatch" }, { status: 400 });
    }
    // 수동채점은 자유 텍스트 — 공백 유지, 500자 제한만.
    payload = { textAnswer: body.textAnswer.slice(0, 500) };
  } else {
    return NextResponse.json({ error: "unsupported_kind" }, { status: 400 });
  }

  const answer = await db.assessmentAnswer.upsert({
    where: {
      submissionId_questionId: { submissionId, questionId: body.questionId },
    },
    create: { submissionId, questionId: body.questionId, payload },
    update: { payload },
  });
  return NextResponse.json({ answer });
}
