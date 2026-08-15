import { describe, expect, it } from "vitest";

import { parseEvaluationResponse } from "./reading-llm";

const VALID_JSON =
  '{"comprehensionScore":3,"evidenceScore":2,"personalResponseScore":3,"expressionScore":1,' +
  '"strength":"주인공의 선택에 대한 생각을 분명히 표현했어요.",' +
  '"evidence":"친구를 소중하게 생각해야 한다고 쓴 부분에서 생각이 드러나요.",' +
  '"question":"그 생각이 들게 한 장면은 무엇이었나요?",' +
  '"nextAction":"다음에는 장면과 이유를 함께 적어 보세요."}';

describe("parseEvaluationResponse", () => {
  it("parses a plain JSON object", () => {
    expect(parseEvaluationResponse(VALID_JSON)).toMatchObject({
      comprehensionScore: 3,
    });
  });

  it("parses a fenced JSON block", () => {
    expect(parseEvaluationResponse(`\`\`\`json\n${VALID_JSON}\n\`\`\``)).toMatchObject({
      evidenceScore: 2,
    });
  });

  it("extracts the trailing JSON after Gemma-style reasoning prose", () => {
    const text = `* Role: Reading coach
* Task: Analyze the reading record.
* Final JSON structure check:
${VALID_JSON}`;
    expect(parseEvaluationResponse(text)).toMatchObject({
      personalResponseScore: 3,
    });
  });

  it("skips stray braces inside reasoning prose and uses the trailing JSON", () => {
    const text = `책 제목(\"재미있는 책\")과 감상(\"재미있었어요\")을 분석했습니다.
점수 범위는 {0~3}, {0~1} 입니다.
결과 JSON:
${VALID_JSON}`;
    expect(parseEvaluationResponse(text)).toMatchObject({
      expressionScore: 1,
    });
  });

  it("returns null when no JSON object exists", () => {
    expect(parseEvaluationResponse("그냥 텍스트 응답입니다.")).toBeNull();
    expect(parseEvaluationResponse("")).toBeNull();
  });

  it("returns null when the only braces do not form valid JSON", () => {
    expect(parseEvaluationResponse("여기 { 깨진 JSON } 입니다.")).toBeNull();
  });
});
