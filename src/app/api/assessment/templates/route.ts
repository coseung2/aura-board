import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import type {
  AssessmentTemplateCreate,
  TeacherQuestionDTO,
} from "@/types/assessment";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

import { withProductFeature } from "@/lib/product-release-server";

export const POST = withProductFeature("developmentLayouts", POSTHandler);
async function POSTHandler(req: Request) {
  try {
    const ids = await resolveIdentities();
    if (!ids.teacher) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as AssessmentTemplateCreate;
    const { classroomId, title, durationMin, boardId, questions } = body;
    if (!classroomId || !title || typeof durationMin !== "number") {
      return badRequest("missing_fields");
    }
    if (durationMin < 1 || durationMin > 240) {
      return badRequest("durationMin_out_of_range");
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      return badRequest("questions_empty");
    }
    if (questions.length > 20) {
      return badRequest("questions_over_max");
    }

    const classroom = await db.classroom.findUnique({
      where: { id: classroomId },
      select: { teacherId: true },
    });
    if (!classroom) return NextResponse.json({ error: "classroom_not_found" }, { status: 404 });
    if (classroom.teacherId !== ids.teacher.userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Validate MCQ + SHORT per question. OX/NUMERIC/ESSAY still rejected.
    for (const [i, q] of questions.entries()) {
      if (!q.prompt?.trim()) return badRequest(`question_${i}_prompt_empty`);
      if (q.kind === "MCQ") {
        if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 6) {
          return badRequest(`question_${i}_choices_invalid`);
        }
        const cids = new Set(q.choices.map((c) => c.id));
        if (cids.size !== q.choices.length) return badRequest(`question_${i}_choice_id_dup`);
        for (const c of q.choices) {
          if (!c.id || !c.text?.trim()) return badRequest(`question_${i}_choice_blank`);
        }
        if (!Array.isArray(q.correctChoiceIds) || q.correctChoiceIds.length === 0) {
          return badRequest(`question_${i}_no_correct`);
        }
        for (const cid of q.correctChoiceIds) {
          if (!cids.has(cid)) return badRequest(`question_${i}_correct_unknown_${cid}`);
        }
      } else if (q.kind === "SHORT") {
        if (!Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0) {
          return badRequest(`question_${i}_no_correct_answers`);
        }
        for (const a of q.correctAnswers) {
          if (typeof a !== "string" || !a.trim()) {
            return badRequest(`question_${i}_answer_blank`);
          }
        }
      } else if (q.kind === "MANUAL") {
        // 수동채점 — 교사가 채점 시점에 결정. 정답표 없음.
      } else {
        return badRequest(`question_${i}_kind_invalid`);
      }
      if (q.maxScore !== undefined && (q.maxScore < 1 || q.maxScore > 100)) {
        return badRequest(`question_${i}_maxScore_invalid`);
      }
    }

    const template = await db.assessmentTemplate.create({
      data: {
        classroomId,
        title: title.trim(),
        durationMin,
        boardId: boardId ?? null,
        createdById: ids.teacher.userId,
        questions: {
          create: questions.map((q, i) => ({
            order: i,
            kind: q.kind,
            prompt: q.prompt.trim(),
            payload:
              q.kind === "MCQ"
                ? { choices: q.choices, correctChoiceIds: q.correctChoiceIds }
                : q.kind === "SHORT"
                  ? { correctAnswers: q.correctAnswers.map((s) => s.trim()) }
                  : {},
            maxScore: q.maxScore ?? 1,
          })),
        },
      },
      include: { questions: { orderBy: { order: "asc" } } },
    });

    const dto = {
      id: template.id,
      classroomId: template.classroomId,
      boardId: template.boardId,
      title: template.title,
      durationMin: template.durationMin,
      createdById: template.createdById,
      createdAt: template.createdAt.toISOString(),
      questions: template.questions.map((q): TeacherQuestionDTO => {
        if (q.kind === "MCQ") {
          const payload = q.payload as { choices: { id: string; text: string }[]; correctChoiceIds: string[] };
          return {
            id: q.id,
            order: q.order,
            kind: "MCQ",
            prompt: q.prompt,
            maxScore: q.maxScore,
            choices: payload.choices,
            correctChoiceIds: payload.correctChoiceIds,
          };
        }
        if (q.kind === "SHORT") {
          const payload = q.payload as { correctAnswers: string[] };
          return {
            id: q.id,
            order: q.order,
            kind: "SHORT",
            prompt: q.prompt,
            maxScore: q.maxScore,
            correctAnswers: payload.correctAnswers,
          };
        }
        return {
          id: q.id,
          order: q.order,
          kind: "MANUAL",
          prompt: q.prompt,
          maxScore: q.maxScore,
        };
      }),
    };
    return NextResponse.json({ template: dto });
  } catch (e) {
    console.error("[POST /api/assessment/templates]", e);
    const message = e instanceof Error ? e.message : "create_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
