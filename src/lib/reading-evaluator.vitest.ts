import { describe, expect, it } from "vitest";

import { normalizeReadingEvaluation } from "./reading-evaluator";

describe("normalizeReadingEvaluation", () => {
  it("calculates the 10-point total from validated rubric components", () => {
    const result = normalizeReadingEvaluation({
      comprehensionScore: 3,
      evidenceScore: 2,
      personalResponseScore: 3,
      expressionScore: 1,
      strength: "주인공의 선택에 대한 생각을 분명히 표현했어요.",
      evidence: "친구를 소중하게 생각해야 한다고 쓴 부분에서 생각이 드러나요.",
      question: "그 생각이 들게 한 장면은 무엇이었나요?",
      nextAction: "다음에는 장면과 이유를 함께 적어 보세요.",
    });

    expect(result.score).toBe(9);
    expect(result.breakdown).toEqual({
      comprehension: 3,
      evidence: 2,
      personalResponse: 3,
      expression: 1,
    });
    expect(result.feedback).toContain("잘한 점:");
    expect(result.feedback).toContain("생각해 볼 질문:");
  });

  it("rejects component scores outside the rubric range", () => {
    expect(() =>
      normalizeReadingEvaluation({
        comprehensionScore: 4,
        evidenceScore: 0,
        personalResponseScore: 0,
        expressionScore: 0,
        strength: "강점",
        evidence: "근거",
        question: "질문",
        nextAction: "행동",
      }),
    ).toThrow();
  });
});
