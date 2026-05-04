import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { viewSection } from "@/lib/rbac";
import { getTeacherKeyForBoard } from "@/lib/llm/teacher-key";
import { generateFeedback } from "@/lib/ai-feedback/generate";
import { isValidStatisticsMissionStep } from "@/lib/statistics/mission-constants";
import { z } from "zod";

const LlmFeedbackSchema = z.object({
  ladderStep: z.enum([
    "experience",
    "currentStatus",
    "reason",
    "condition",
    "alternative",
    "position",
  ]),
  text: z.string().max(1000),
});

function sleep(ms: number) {
  return new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms)
  );
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; step: string }> }
) {
  try {
    const { id: sectionId, step } = await ctx.params;
    const stepNumber = parseInt(step, 10);
    if (!isValidStatisticsMissionStep(stepNumber)) {
      return NextResponse.json({ error: "invalid_step" }, { status: 400 });
    }

    const [user, student] = await Promise.all([
      getCurrentUser().catch(() => null),
      getCurrentStudent(),
    ]);

    const section = await viewSection(sectionId, {
      userId: user?.id ?? null,
      studentClassroomId: student?.classroomId ?? null,
    });

    if (student) {
      const membership = await db.breakoutMembership.findFirst({
        where: { sectionId, studentId: student.id },
      });
      if (!membership) {
        return NextResponse.json({ error: "not_your_team" }, { status: 403 });
      }
    }

    const body = await req.json().catch(() => ({}));
    const input = LlmFeedbackSchema.parse(body);

    const key = await getTeacherKeyForBoard(section.boardId);
    if (!key) {
      return NextResponse.json(
        { error: "ai_key_missing", message: "교사가 AI API 키를 설정하지 않았습니다." },
        { status: 503 }
      );
    }

    const systemPrompt = `당신은 통계 탐구 보조교사입니다. 학생이 작성한 질문 사다리 단계에 대해 구체적이고 격려하는 피드백을 한국어로 제공해 주세요. 질문이 모호하거나 개선할 점이 있다면 구체적인 대안을 제시해 주세요.`;

    const userPrompt = `학생이 작성한 내용:\n${input.text}\n\n이 내용에 대해 피드백을 주세요.`;

    const result = await Promise.race([
      generateFeedback({
        provider: key.provider,
        apiKey: key.apiKey,
        baseUrl: key.baseUrl,
        modelId: key.modelId,
        systemPrompt,
        userPrompt,
      }),
      sleep(5000),
    ]);

    if (!result || result.ok === false) {
      const errorMsg =
        !result || result.ok === false
          ? result?.error ?? "AI 조언을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요."
          : "timeout";
      return NextResponse.json(
        { error: "llm_failed", message: errorMsg },
        { status: 504 }
      );
    }

    const feedback = result.text;

    const existing = await db.mission.findUnique({
      where: { sectionId_stepNumber: { sectionId, stepNumber } },
    });

    const content = (existing?.content as Record<string, unknown>) ?? {};
    const questionLadder = (content.questionLadder as Record<string, unknown>) ?? {};

    await db.mission.update({
      where: { sectionId_stepNumber: { sectionId, stepNumber } },
      data: {
        content: {
          ...content,
          questionLadder: {
            ...questionLadder,
            llmFeedback: feedback,
          },
        },
      },
    });

    return NextResponse.json({ feedback });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if ((e as Error).message === "timeout") {
      return NextResponse.json(
        { error: "llm_timeout", message: "AI 조언을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요." },
        { status: 504 }
      );
    }
    console.error("[POST /api/sections/:id/missions/:step/llm-feedback]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
