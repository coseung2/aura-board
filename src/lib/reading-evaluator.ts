import "server-only";

import { z } from "zod";

export type ReadingBookType = "comic" | "story";

export type ReadingEvaluationInput = {
  bookType: ReadingBookType;
  title: string;
  author: string;
  reflection: string;
  previousReflection?: string;
  previousScore?: number;
  previousFeedback?: string;
};

export type ReadingEvaluationBreakdown = {
  comprehension: number;
  evidence: number;
  personalResponse: number;
  expression: number;
};

export type ReadingEvaluationResult = {
  score: number;
  feedback: string;
  breakdown: ReadingEvaluationBreakdown;
};

const shortText = z.string().trim().min(1).max(220);

const readingEvaluationSchema = z.object({
  comprehensionScore: z.coerce.number().int().min(0).max(3),
  evidenceScore: z.coerce.number().int().min(0).max(3),
  personalResponseScore: z.coerce.number().int().min(0).max(3),
  expressionScore: z.coerce.number().int().min(0).max(1),
  strength: shortText,
  evidence: shortText,
  question: shortText,
  nextAction: shortText,
});

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * LLM이 반환한 세부 점수와 문장을 서버에서 검증하고 최종 10점 점수를 계산한다.
 * 모델이 총점을 직접 결정하지 않도록 해 평균·독서왕 집계의 일관성을 지킨다.
 */
export function normalizeReadingEvaluation(value: unknown): ReadingEvaluationResult {
  const parsed = readingEvaluationSchema.parse(value);
  const breakdown: ReadingEvaluationBreakdown = {
    comprehension: parsed.comprehensionScore,
    evidence: parsed.evidenceScore,
    personalResponse: parsed.personalResponseScore,
    expression: parsed.expressionScore,
  };
  const score =
    breakdown.comprehension +
    breakdown.evidence +
    breakdown.personalResponse +
    breakdown.expression;

  const feedback = [
    `잘한 점: ${oneLine(parsed.strength)}`,
    `글에서 찾은 근거: ${oneLine(parsed.evidence)}`,
    `생각해 볼 질문: ${oneLine(parsed.question)}`,
    `다음 기록: ${oneLine(parsed.nextAction)}`,
  ].join(" ");

  return { score, feedback, breakdown };
}
