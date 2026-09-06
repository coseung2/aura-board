import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import { canManageAssessment } from "@/lib/assessment-permissions";
import type {
  ManualAnswerPayload,
  ManualQueuePayload,
} from "@/types/assessment";

/**
 * Teacher-only queue of manual-graded questions + per-student answers.
 * Returns one item per MANUAL question with the submitted-student list
 * (skip students who haven't submitted yet). Ordered by question.order.
 */
import { withProductFeature } from "@/lib/product-release-server";

export const GET = withProductFeature("developmentLayouts", GETHandler);
async function GETHandler(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ids = await resolveIdentities();
  if (!(await canManageAssessment(id, ids))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const template = await db.assessmentTemplate.findUnique({
    where: { id },
    include: {
      questions: {
        where: { kind: "MANUAL" },
        orderBy: { order: "asc" },
        include: {
          answers: {
            include: {
              submission: {
                include: { student: { select: { id: true, name: true, number: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!template) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const items = template.questions.map((q) => ({
    questionId: q.id,
    questionOrder: q.order,
    questionMaxScore: q.maxScore,
    entries: q.answers
      .filter((a) => a.submission.status === "submitted")
      .map((a) => ({
        submissionId: a.submissionId,
        studentId: a.submission.studentId,
        studentNumber: a.submission.student.number,
        studentName: a.submission.student.name,
        textAnswer: (a.payload as ManualAnswerPayload).textAnswer ?? "",
        manualScore: a.manualScore,
      }))
      .sort((x, y) => {
        if (x.studentNumber != null && y.studentNumber != null)
          return x.studentNumber - y.studentNumber;
        if (x.studentNumber != null) return -1;
        if (y.studentNumber != null) return 1;
        return x.studentName.localeCompare(y.studentName, "ko");
      }),
  }));

  const payload: ManualQueuePayload = { items };
  return NextResponse.json(payload);
}
