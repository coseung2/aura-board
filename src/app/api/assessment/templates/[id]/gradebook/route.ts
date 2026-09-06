import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import { canManageAssessment } from "@/lib/assessment-permissions";
import { isCorrectMcq, isCorrectShort } from "@/lib/assessment-grading";
import type {
  AssessmentGradebookPayload,
  ManualAnswerPayload,
  McqAnswerPayload,
  McqQuestionPayload,
  ShortAnswerPayload,
  ShortQuestionPayload,
  TeacherQuestionDTO,
} from "@/types/assessment";

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
      questions: { orderBy: { order: "asc" } },
      classroom: {
        include: { students: { orderBy: [{ number: "asc" }, { name: "asc" }] } },
      },
      submissions: {
        include: {
          answers: true,
          gradebookEntry: true,
        },
      },
    },
  });
  if (!template) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const submissionByStudent = new Map(
    template.submissions.map((s) => [s.studentId, s])
  );

  const maxScoreTotal = template.questions.reduce(
    (acc, q) => acc + q.maxScore,
    0
  );

  const teacherQuestions: TeacherQuestionDTO[] = template.questions.map((q) => {
    if (q.kind === "MCQ") {
      const p = q.payload as McqQuestionPayload;
      return {
        id: q.id,
        order: q.order,
        kind: "MCQ" as const,
        prompt: q.prompt,
        maxScore: q.maxScore,
        choices: p.choices,
        correctChoiceIds: p.correctChoiceIds,
      };
    }
    if (q.kind === "SHORT") {
      const p = q.payload as ShortQuestionPayload;
      return {
        id: q.id,
        order: q.order,
        kind: "SHORT" as const,
        prompt: q.prompt,
        maxScore: q.maxScore,
        correctAnswers: p.correctAnswers,
      };
    }
    return {
      id: q.id,
      order: q.order,
      kind: "MANUAL" as const,
      prompt: q.prompt,
      maxScore: q.maxScore,
    };
  });

  const rows = template.classroom.students.map((student) => {
    const submission = submissionByStudent.get(student.id) ?? null;
    let pendingManualCount = 0;
    const answers = (submission?.answers ?? []).map((a) => {
      const q = template.questions.find((x) => x.id === a.questionId);
      if (q?.kind === "MANUAL") {
        const text = (a.payload as ManualAnswerPayload).textAnswer ?? "";
        const manualScore = a.manualScore;
        const needsManual = manualScore === null;
        if (needsManual) pendingManualCount += 1;
        return {
          questionId: a.questionId,
          kind: "MANUAL" as const,
          selectedChoiceIds: [],
          textAnswer: text,
          correct: manualScore === null ? null : manualScore === q.maxScore,
          autoScore: null,
          manualScore,
          needsManual,
        };
      }
      if (q?.kind === "SHORT") {
        const text = (a.payload as ShortAnswerPayload).textAnswer ?? "";
        const correct = isCorrectShort(
          (q.payload as ShortQuestionPayload).correctAnswers,
          text
        );
        return {
          questionId: a.questionId,
          kind: "SHORT" as const,
          selectedChoiceIds: [],
          textAnswer: text,
          correct,
          autoScore: a.autoScore,
          manualScore: null,
          needsManual: false,
        };
      }
      const selected = (a.payload as McqAnswerPayload).selectedChoiceIds ?? [];
      const correctIds =
        q && (q.payload as McqQuestionPayload).correctChoiceIds;
      const correct = correctIds ? isCorrectMcq(correctIds, selected) : null;
      return {
        questionId: a.questionId,
        kind: "MCQ" as const,
        selectedChoiceIds: selected,
        textAnswer: null,
        correct,
        autoScore: a.autoScore,
        manualScore: null,
        needsManual: false,
      };
    });
    return {
      student: { id: student.id, name: student.name, number: student.number },
      submission: submission
        ? {
            id: submission.id,
            status: submission.status as "in_progress" | "submitted",
            startedAt: submission.startedAt.toISOString(),
            submittedAt: submission.submittedAt?.toISOString() ?? null,
          }
        : null,
      answers,
      entry: submission?.gradebookEntry
        ? {
            id: submission.gradebookEntry.id,
            finalScore: submission.gradebookEntry.finalScore,
            releasedAt:
              submission.gradebookEntry.releasedAt?.toISOString() ?? null,
          }
        : null,
      pendingManualCount,
      totalAutoScore: answers.reduce(
        (acc, a) => acc + (a.manualScore ?? a.autoScore ?? 0),
        0
      ),
    };
  });

  const payload: AssessmentGradebookPayload = {
    template: {
      id: template.id,
      classroomId: template.classroomId,
      boardId: template.boardId,
      title: template.title,
      durationMin: template.durationMin,
      createdById: template.createdById,
      createdAt: template.createdAt.toISOString(),
      questions: teacherQuestions,
    },
    rows,
    maxScoreTotal,
  };
  return NextResponse.json(payload);
}
