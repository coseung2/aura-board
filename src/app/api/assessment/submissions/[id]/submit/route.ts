import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import { gradeMcq, gradeShort } from "@/lib/assessment-grading";
import type {
  ManualAnswerPayload,
  McqAnswerPayload,
  McqQuestionPayload,
  ShortAnswerPayload,
  ShortQuestionPayload,
} from "@/types/assessment";

import { withProductFeature } from "@/lib/product-release-server";

export const POST = withProductFeature("developmentLayouts", POSTHandler);
async function POSTHandler(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: submissionId } = await params;
  const ids = await resolveIdentities();
  if (!ids.student) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const submission = await db.assessmentSubmission.findUnique({
    where: { id: submissionId },
    include: {
      template: {
        include: { questions: { orderBy: { order: "asc" } } },
      },
      answers: true,
    },
  });
  if (!submission) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (submission.studentId !== ids.student.studentId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (submission.status === "submitted") {
    return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  }

  // Grade every question. Unanswered questions score 0.
  let total = 0;
  const answerByQid = new Map(submission.answers.map((a) => [a.questionId, a]));
  const updates: Array<Promise<unknown>> = [];
  for (const q of submission.template.questions) {
    const row = answerByQid.get(q.id);
    // MANUAL 문항은 autoScore=null 로 두어 gradebook 에서 "채점 대기"로
    // 표시되도록 한다. 합계에는 0 으로 일단 포함(교사 채점 전).
    if (q.kind === "MANUAL") {
      if (!row) {
        updates.push(
          db.assessmentAnswer.create({
            data: {
              submissionId,
              questionId: q.id,
              payload: { textAnswer: "" } satisfies ManualAnswerPayload,
              autoScore: null,
            },
          })
        );
      }
      continue;
    }
    let score: number;
    if (q.kind === "MCQ") {
      const payload = row ? (row.payload as McqAnswerPayload) : null;
      score = gradeMcq(
        { maxScore: q.maxScore, payload: q.payload as McqQuestionPayload },
        payload
      );
    } else if (q.kind === "SHORT") {
      const payload = row ? (row.payload as ShortAnswerPayload) : null;
      score = gradeShort(
        { maxScore: q.maxScore, payload: q.payload as ShortQuestionPayload },
        payload
      );
    } else {
      score = 0;
    }
    total += score;
    if (row) {
      updates.push(
        db.assessmentAnswer.update({
          where: { id: row.id },
          data: { autoScore: score },
        })
      );
    } else {
      updates.push(
        db.assessmentAnswer.create({
          data: {
            submissionId,
            questionId: q.id,
            payload:
              q.kind === "MCQ"
                ? ({ selectedChoiceIds: [] } satisfies McqAnswerPayload)
                : ({ textAnswer: "" } satisfies ShortAnswerPayload),
            autoScore: 0,
          },
        })
      );
    }
  }
  await Promise.all(updates);

  const updated = await db.assessmentSubmission.update({
    where: { id: submissionId },
    data: { status: "submitted", submittedAt: new Date() },
  });
  return NextResponse.json({ submission: updated, autoScore: total });
}
