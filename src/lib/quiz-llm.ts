import { generateFeedback } from "@/lib/ai-feedback/generate";
import type { ResolvedTeacherAi } from "@/lib/ai/teacher-ai";
import type { QuizDifficulty, QuizDraftQuestion } from "@/types/quiz";

export type QuizCountSpec = { mode: "auto" } | { mode: "fixed"; n: number };

const DIFFICULTY_LABEL: Record<QuizDifficulty, string> = {
  easy: "쉬움 (초등 저학년 수준의 기본 사실 확인)",
  medium: "중간 (개념 이해와 간단한 추론)",
  hard: "어려움 (응용·종합 판단)",
};

export async function generateQuizFromText(
  text: string,
  llm: ResolvedTeacherAi,
  countSpec: QuizCountSpec,
  difficulty: QuizDifficulty = "medium",
): Promise<QuizDraftQuestion[]> {
  const countInstruction =
    countSpec.mode === "fixed"
      ? `정확히 ${countSpec.n}개의 4지선다 문항을 만들어주세요.`
      : "본문 길이와 내용에 맞는 적절한 수의 4지선다 문항을 만들어주세요. 최대 20개를 넘지 않도록 하고, 본문이 매우 짧으면 3~5개도 허용합니다.";

  const systemPrompt = `난이도: ${DIFFICULTY_LABEL[difficulty]}
${countInstruction}
반드시 아래 JSON 배열 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요:
[{"question":"문제","optionA":"보기A","optionB":"보기B","optionC":"보기C","optionD":"보기D","answer":"A"}]
answer는 반드시 A, B, C, D 중 하나여야 합니다.
문제는 한국어로 작성하세요.`;

  const result = await generateFeedback({
    provider: llm.provider,
    apiKey: llm.apiKey,
    baseUrl: llm.baseUrl,
    modelId: llm.modelId,
    systemPrompt,
    userPrompt: `다음 텍스트를 바탕으로 퀴즈를 생성하세요:\n\n${text.slice(0, 8000)}`,
  });
  if (!result.ok) {
    throw new Error(`Quiz LLM error: ${result.error}`);
  }

  const jsonMatch = result.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("LLM did not return valid JSON array");
  }

  const questions: QuizDraftQuestion[] = JSON.parse(jsonMatch[0]);
  for (const question of questions) {
    if (
      !question.question ||
      !question.optionA ||
      !question.optionB ||
      !question.optionC ||
      !question.optionD
    ) {
      throw new Error("Invalid question format from LLM");
    }
    if (!["A", "B", "C", "D"].includes(question.answer)) {
      question.answer = "A";
    }
  }

  const capped = questions.slice(0, 20);
  return countSpec.mode === "fixed" ? capped.slice(0, countSpec.n) : capped;
}
