import { describe, expect, it } from "vitest";

import {
  liveQuizAnswerSchema,
  liveQuizQuestionInputSchema,
} from "./validation";

describe("live quiz validation", () => {
  it("normalizes a valid four-choice question", () => {
    expect(
      liveQuizQuestionInputSchema.parse({
        prompt: "  가장 큰 행성은 무엇일까요?  ",
        choices: [" 지구 ", " 화성 ", " 목성 ", " 금성 "],
        correctChoice: 2,
      }),
    ).toEqual({
      prompt: "가장 큰 행성은 무엇일까요?",
      choices: ["지구", "화성", "목성", "금성"],
      correctChoice: 2,
      explanation: "",
      category: "",
    });
  });

  it("rejects duplicate choices after whitespace and case normalization", () => {
    const result = liveQuizQuestionInputSchema.safeParse({
      prompt: "서로 다른 선택지를 골라 주세요.",
      choices: ["Aura", " aura ", "보드", "퀴즈"],
      correctChoice: 0,
    });
    expect(result.success).toBe(false);
  });

  it("accepts only the four answer indexes", () => {
    const common = {
      sessionKey: "2026-08-06",
      questionId: "question-1",
    };
    expect(
      liveQuizAnswerSchema.safeParse({ ...common, selectedChoice: 3 }).success,
    ).toBe(true);
    expect(
      liveQuizAnswerSchema.safeParse({ ...common, selectedChoice: 4 }).success,
    ).toBe(false);
  });
});
